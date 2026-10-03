/** Runs only in the opaque-origin frame. No host commands or network capabilities. */
export const STUDIO_BRIDGE_SOURCE = String.raw`
(()=>{
  const config = window.__veyraStudioConfig;
  let state = {}, initialized = false, failed = false, timer;
  const callbacks = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const send = (type, extra = {}) => {
    if (parent !== window) parent.postMessage({channel:config.channel,type,...extra}, '*');
  };
  const error = message => { failed = true; send('error',{message:String(message).slice(0,500)}); };
  addEventListener('error', event => error(event.message || 'The environment script failed.'));
  addEventListener('unhandledrejection', event => error(event.reason instanceof Error ? event.reason.message : String(event.reason)));
  const bounded = value => {
    try { const text = JSON.stringify(value); return new TextEncoder().encode(text).length <= 16384 ? JSON.parse(text) : undefined; } catch { return undefined; }
  };
  const publish = () => { clearTimeout(timer); send('state',{state}); };
  const persist = () => { clearTimeout(timer); timer = setTimeout(publish,180); };
  const controls = () => Array.from(document.querySelectorAll('input,select,textarea')).filter(el =>
    !['password','file','hidden'].includes(el.type) && (el.dataset.studioKey || el.name));
  const key = el => el.dataset.studioKey || el.name;
  const restore = () => {
    for (const el of controls()) {
      const value = state.$controls && state.$controls[key(el)];
      if (value === undefined) continue;
      if (el.type === 'radio') el.checked = value === el.value;
      else if (el.type === 'checkbox') el.checked = value === true;
      else if (el.tagName === 'SELECT' && el.multiple && Array.isArray(value)) {
        for (const option of el.options) option.selected = value.includes(option.value);
      } else el.value = String(value);
    }
    if (state.$scroll) scrollTo(Number(state.$scroll.x)||0, Number(state.$scroll.y)||0);
  };
  const capture = event => {
    if (!initialized || !event.isTrusted) return;
    const values = Object.create(null);
    for (const el of controls()) {
      if (el.type === 'radio' && !el.checked) continue;
      values[key(el)] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' && el.multiple
        ? Array.from(el.selectedOptions).map(option => option.value) : el.value;
    }
    const next = bounded({...state,$controls:values});
    if (!next) return;
    state = next;
    if (event.type === 'change') publish(); else persist();
  };
  addEventListener('input',capture);
  addEventListener('change',capture);
  addEventListener('scroll',() => {
    if (!initialized) return;
    const next = bounded({...state,$scroll:{x:scrollX,y:scrollY}});
    if (next) { state=next; persist(); }
  },{passive:true});
  addEventListener('pagehide',publish);

  const chart = (target, options) => {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) throw new Error('Chart container was not found.');
    const values = options.values;
    if (!Array.isArray(values) || !values.length || values.length > 200 || values.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Charts need 1–200 finite numeric values.');
    const labels = values.map((v,i)=>String((options.labels||[])[i] ?? i+1));
    const color = /^#[0-9a-f]{3,8}$/i.test(options.color||'') ? options.color : '#a9a3ff';
    const ns = 'http://www.w3.org/2000/svg';
    const node = (tag, attrs, text) => {
      const el=document.createElementNS(ns,tag);
      for(const [k,v] of Object.entries(attrs||{})) el.setAttribute(k,String(v));
      if(text!==undefined) el.textContent=text;
      return el;
    };
    const svg=node('svg',{viewBox:'0 0 720 320',role:'group','aria-label':String(options.title||'Interactive chart')});
    svg.style.cssText='display:block;width:100%;height:auto;overflow:visible';
    const low=Math.min(0,...values), high=Math.max(0,...values), span=high-low||1;
    const y=v=>260-(v-low)/span*225, step=640/values.length;
    svg.append(node('line',{x1:50,x2:690,y1:y(0),y2:y(0),stroke:'currentColor','stroke-opacity':'.25'}));
    for(let i=0;i<5;i++) {
      const value=low+span*i/4;
      svg.append(node('text',{x:42,y:y(value)+4,'text-anchor':'end','font-size':11,fill:'currentColor','fill-opacity':'.65'},Number(value.toFixed(2)).toLocaleString()));
    }
    if(options.type==='line') svg.append(node('polyline',{points:values.map((v,i)=>(50+step*(i+.5))+','+y(v)).join(' '),fill:'none',stroke:color,'stroke-width':3}));
    const chartId=element.id || 'chart';
    const highlight=index=>{
      for(const item of svg.querySelectorAll('[data-chart-index]')) {
        const selected=Number(item.getAttribute('data-chart-index'))===index;
        item.setAttribute('aria-pressed',String(selected));
        item.setAttribute('stroke',selected ? 'currentColor' : 'none');
        item.setAttribute('stroke-width',selected ? '2' : '0');
      }
    };
    values.forEach((value,i)=>{
      const x=50+step*(i+.5);
      const mark=options.type==='line' ? node('circle',{cx:x,cy:y(value),r:5,fill:color})
        : node('rect',{x:x-step*.32,y:Math.min(y(value),y(0)),width:step*.64,height:Math.max(2,Math.abs(y(value)-y(0))),rx:3,fill:color});
      mark.setAttribute('tabindex','0'); mark.setAttribute('role','button');
      mark.setAttribute('aria-label',labels[i]+': '+value); mark.style.cursor='pointer';
      mark.setAttribute('data-chart-index',String(i)); mark.setAttribute('aria-pressed','false');
      mark.append(node('title',{},labels[i]+': '+value));
      const select=()=>{
        highlight(i);
        window.studio.setState({chartSelection:{chart:chartId,label:labels[i],value,index:i}});
        window.studio.emit('chart.select',{label:labels[i],value,index:i});
        if(typeof options.onSelect==='function') options.onSelect({label:labels[i],value,index:i});
      };
      mark.addEventListener('click',select);
      mark.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
      svg.append(mark);
      if(values.length<=12 || i % Math.ceil(values.length/12)===0) svg.append(node('text',{x,y:285,'text-anchor':'middle','font-size':11,fill:'currentColor'},labels[i].slice(0,18)));
    });
    element.replaceChildren(svg);
    const previous=state.chartSelection;
    if(previous && (!previous.chart || previous.chart===chartId)) {
      const index=labels.indexOf(previous.label);
      if(index>=0) {
        highlight(index);
        const point={label:labels[index],value:values[index],index};
        window.studio.setState({chartSelection:{chart:chartId,...point}});
        if(typeof options.onSelect==='function') options.onSelect(point);
      }
    }
    return svg;
  };
  window.studio = Object.freeze({
    data: Object.freeze(config.data || {}),
    getState:()=>clone(state),
    setState:patch=>{
      if(!patch || typeof patch!=='object' || Array.isArray(patch)) throw new Error('State must be an object.');
      const next=bounded({...state,...patch});
      if(!next) throw new Error('Interaction state exceeds 16 KB.');
      state=next; publish();
    },
    emit:(name,payload=null)=>{
      if(typeof name!=='string' || !/^[\w .:-]{1,80}$/.test(name)) throw new Error('Invalid interaction name.');
      const value=bounded(payload);
      if(value===undefined) throw new Error('Interaction payload exceeds 16 KB.');
      publish(); send('event',{name,payload:value});
    },
    chart,
    ready:callback=>initialized ? callback() : callbacks.push(callback),
  });
  const initialize = initial => {
    if(initialized) return;
    state=bounded(initial)||{}; initialized=true;
    try { restore(); for(const callback of callbacks) callback(); restore(); }
    catch(reason) { error(reason instanceof Error ? reason.message : String(reason)); }
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(!failed) send('ready'); }));
  };
  addEventListener('message',event=>{
    if(event.source!==parent || !event.data || event.data.channel!==config.channel || event.data.type!=='initialize') return;
    initialize(event.data.state);
  });
  addEventListener('DOMContentLoaded',()=>{
    if(config.channel && parent!==window) send('connect'); else initialize(config.state||{});
  },{once:true});
  const size=()=>{if(parent!==window)parent.postMessage({type:'veyra-studio-size',height:Math.ceil(Math.max(document.body.scrollHeight,document.documentElement.scrollHeight))},'*');};
  addEventListener('load',size);
  if('ResizeObserver' in window)new ResizeObserver(size).observe(document.body);
})();
`;
