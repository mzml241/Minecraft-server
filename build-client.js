const fs = require('fs');
const path = require('path');

const serverDir = __dirname;
const sourcePath = path.join(serverDir, 'client', 'index.html');
const publicDir = path.join(serverDir, 'public');
const outputPath = path.join(publicDir, 'index.html');
const blockRegistryPath = path.join(serverDir, 'shared', 'block-registry.json');
const blockRegistry = JSON.parse(fs.readFileSync(blockRegistryPath, 'utf8'));

function readSource() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Client source not found. Keep client/index.html in the repository.');
  }
  return fs.readFileSync(sourcePath, 'utf8');
}

function injectServerDeployment(html) {
  const serverStyle = `
<style id="voxelcraft-server-style">
  /* The public deployment is multiplayer-only. Keep the local client source
     portable while hiding local-world controls in the generated shell. */
  #btnSave,#btnLoad,#btnSaveFile,#btnLoadFile,#worldFileInput,#btnNew,
  #seedInput,.opt:has(#seedInput),.opt:has(#mpServer),#mpServer,
  .serverLocalHint { display:none !important; }
  #btnMpDisconnect { display:inline-block; }
  #menu .serverAuthNote { color:#9bf0a4; }
</style>`;

  html = html.replace('</head>', `${serverStyle}\n<script>window.__SERVER_DEPLOYMENT__=true;</script>\n</head>`);
  html = html.replace('<div class="opt"><label>SERVER LINK', '<div class="opt serverLocalHint"><label>SERVER LINK');
  html = html.replace('<div class="opt"><label>NEW WORLD SEED', '<div class="opt serverLocalHint"><label>NEW WORLD SEED');
  html = html.replace('<div class="fileHint">World files include the seed, edits, player position and settings. They can be copied to another browser or device.</div>', '<div class="fileHint serverLocalHint">World files are disabled on the multiplayer server.</div>');
  html = html.replace('<div><b>WORLD FILE</b> — download / open a portable world</div>', '<div class="serverLocalHint"><b>WORLD FILE</b> — local files are disabled on the multiplayer server</div>');
  html = html.replace('BUILD · OWN · EARN · a shared world with one Common Spawn Area.', 'MULTIPLAYER SERVER · BUILD · OWN · EARN · one shared Common Spawn Area.');
  html = html.replace('OFFLINE · Singleplayer', 'OFFLINE · LOGIN REQUIRED');
  html = html.replace('id="btnMpDisconnect">DISCONNECT', 'id="btnMpDisconnect">LOG OUT');

  const serverResumePatch = `
<script>
if(SERVER_DEPLOYMENT){
  window.setServerAuthFormVisible=function(show){
    ['mpUsername','mpPassword','mpName'].forEach(id=>{const el=document.getElementById(id);if(el&&el.parentElement)el.parentElement.style.display=show?'':'none';});
    const login=document.getElementById('btnMpConnect'); if(login)login.style.display=show?'':'none';
  };
  function beginRememberedServerSession(){
    let token='',username='',name='';
    try{token=localStorage.getItem(SERVER_SESSION_STORAGE_KEY)||'';username=localStorage.getItem('voxelcraftMpUsername')||'';name=localStorage.getItem('voxelcraftMpName')||username; }catch(error){}
    if(!token||!username){
      window.setServerAuthFormVisible(true);
      setMpStatus('OFFLINE · LOGIN REQUIRED');
      return;
    }
    const connect=()=>{
      if(!started){setTimeout(connect,100);return;}
      const usernameInput=document.getElementById('mpUsername'),nameInput=document.getElementById('mpName');
      if(usernameInput)usernameInput.value=username;
      if(nameInput)nameInput.value=name;
      window.setServerAuthFormVisible(false);
      setMpStatus('CONNECTING · RESUMING SESSION');
      multiplayer.connect(normaliseServerUrl(''),name,username,'',token);
    };
    connect();
  }
  setTimeout(beginRememberedServerSession,100);
}
</script>`;

  const bodyMarker = '</body>';
  if (!html.includes(bodyMarker)) throw new Error('Client source is missing </body>.');
  html = html.replace(bodyMarker, `${serverResumePatch}\n${bodyMarker}`);
  return html;
}

let html = injectServerDeployment(readSource());
// The browser source keeps a small fallback contract for direct local loading;
// deployment receives the canonical server/client registry from one file.
const contractScript = `<script>window.__VOXELCRAFT_BLOCK_CONTRACT__=${JSON.stringify(blockRegistry)};</script>`;
html = html.replace('</head>', `${contractScript}\n</head>`);
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outputPath, html);
console.log(`Generated ${path.relative(process.cwd(), outputPath)} from ${path.relative(process.cwd(), sourcePath)}`);
