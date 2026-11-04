# Bundled Pi runtime

Veyra runs the Pi and Node copies packaged with the application. End users do not need either installed globally. The model registry worker uses the same bundled SDK.

`scripts/pi/package.json` pins Pi; its lockfile pins transitive dependencies. `node scripts/prepare-pi.mjs` installs those production dependencies into the ignored `src-tauri/resources/pi` directory and copies the build machine's Node executable. Tauri development and build commands prepare these resources automatically. Build on the target OS and architecture with Node 20 or newer. The first preparation requires npm registry access; installed applications do not download a runtime.

To update Pi, update the manifest and regenerate its lockfile with `npm install --package-lock-only --prefix scripts/pi`, then run the preparation script and agent tests. Dependency licenses remain in the bundled package tree.

While a response is running, type a text message in the composer and send it to steer the active Pi run. Stop remains available. Successfully submitted steering messages are saved in conversation history. Attachments can be sent after the response finishes.
