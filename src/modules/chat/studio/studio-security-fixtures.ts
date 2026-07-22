export type StudioSecurityFixture = {
  name: string;
  html: string;
  css: string;
};

export const STUDIO_SECURITY_FIXTURES: StudioSecurityFixture[] = [
  { name: "script tag", html: "<script>alert(1)</script>", css: "" },
  { name: "mixed-case handler", html: "<img OnError=alert(1) src=x>", css: "" },
  { name: "encoded remote href", html: '<a href="javascript:alert(1)">x</a>', css: "" },
  { name: "svg external href", html: '<svg><a href="https://example.com"><text>x</text></a></svg>', css: "" },
  { name: "meta refresh", html: '<meta http-equiv="refresh" content="0;url=https://example.com">', css: "" },
  { name: "nested iframe", html: "<iframe srcdoc=\"<script>x</script>\"></iframe>", css: "" },
  { name: "form submission", html: '<form action="https://example.com"><button>Go</button></form>', css: "" },
  { name: "css import", html: "<main>x</main>", css: '@import url("https://example.com/a.css");' },
  { name: "css url", html: "<main>x</main>", css: "main{background:url(https://example.com/a.png)}" },
  { name: "style termination", html: "<main>x</main>", css: "</style><script>x</script>" },
  { name: "expression", html: "<main>x</main>", css: "main{width:expression(alert(1))}" },
  { name: "inline style url", html: '<main style="background:url(https://example.com/a.png)">x</main>', css: "" },
  { name: "data uri image", html: '<img src="data:image/png;base64,abc">', css: "" },
  { name: "portal element", html: "<portal src=\"https://example.com\"></portal>", css: "" },
];
