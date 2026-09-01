const fs = require('fs');
const path = require('path');

const serverDir = __dirname;
const sourcePath = path.join(serverDir, '..', 'index.html');
const publicDir = path.join(serverDir, 'public');
const outputPath = path.join(publicDir, 'index.html');

function readSource() {
  if (fs.existsSync(sourcePath)) return fs.readFileSync(sourcePath, 'utf8');
  if (fs.existsSync(outputPath)) return fs.readFileSync(outputPath, 'utf8');
  throw new Error('Client source not found. Keep the original index.html beside the server directory.');
}

let html = readSource();

if (!html.includes('window.__SERVER_DEPLOYMENT__=true')) {
  const serverStyle = `
<style id="voxelcraft-server-style">
  /* The public deployment is multiplayer-only. Keep the original local
     client untouched; this generated shell hides local-world controls. */
  #btnSave,#btnLoad,#btnSaveFile,#btnLoadFile,#worldFileInput,#btnNew,
  #seedInput,.opt:has(#seedInput),.opt:has(#mpServer),#mpServer,
  .serverLocalHint { display:none !important; }
  #btnMpDisconnect { display:inline-block; }
  #menu .serverAuthNote { color:#9bf0a4; }
</style>
`;
  html = html.replace('</head>', `${serverStyle}\n<script>window.__SERVER_DEPLOYMENT__=true;</script>\n</head>`);
  html = html.replace('<div class="opt"><label>SERVER LINK', '<div class="opt serverLocalHint"><label>SERVER LINK');
  html = html.replace('<div class="opt"><label>NEW WORLD SEED', '<div class="opt serverLocalHint"><label>NEW WORLD SEED');
  html = html.replace('<div class="fileHint">World files include the seed, edits, player position and settings. They can be copied to another browser or device.</div>', '<div class="fileHint serverLocalHint">World files are disabled on the multiplayer server.</div>');
  html = html.replace('<div><b>WORLD FILE</b> — download / open a portable world</div>', '<div class="serverLocalHint"><b>WORLD FILE</b> — local files are disabled on the multiplayer server</div>');
  html = html.replace('BUILD · OWN · EARN · a shared world with one Common Spawn Area.', 'MULTIPLAYER SERVER · BUILD · OWN · EARN · one shared Common Spawn Area.');
  html = html.replace('OFFLINE · Singleplayer', 'OFFLINE · LOGIN REQUIRED');
  html = html.replace('id="btnMpDisconnect">DISCONNECT', 'id="btnMpDisconnect">LOG OUT');

  const serverResumePatch = `
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
`;
  const marker = 'requestAnimationFrame(frame);\n</script>';
  const markerIndex = html.lastIndexOf(marker);
  if (markerIndex >= 0) {
    html = html.slice(0, markerIndex) + `requestAnimationFrame(frame);\n${serverResumePatch}</script>` + html.slice(markerIndex + marker.length);
  }
}

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outputPath, html);
console.log(`Generated ${path.relative(process.cwd(), outputPath)} from ${path.relative(process.cwd(), sourcePath)}`);
