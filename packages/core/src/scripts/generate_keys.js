const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateAndSave(envName) {
    const dir = path.resolve(__dirname, `../../../../.keys/${envName}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(path.join(dir, 'ed25519.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const pubKeyString = publicKey.export({ type: 'spki', format: 'pem' }).toString('utf8');
    fs.writeFileSync(path.join(dir, 'ed25519.pub'), pubKeyString);
    
    console.log(`\n=== ${envName.toUpperCase()} PUBLIC KEY ===`);
    console.log(pubKeyString.replace(/\n'/g, "\\n"));
}

generateAndSave('dev');
generateAndSave('prod');
