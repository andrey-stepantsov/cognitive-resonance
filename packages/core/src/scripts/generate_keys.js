const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateAndSave(envName) {
    let rootDir = __dirname;
    while (rootDir && rootDir !== path.parse(rootDir).root) {
        if (fs.existsSync(path.join(rootDir, 'package.json'))) {
            const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
            if (pkg.name === 'cognitive-resonance') break;
        }
        rootDir = path.dirname(rootDir);
    }
    const dir = path.resolve(rootDir, `.keys/${envName}`);
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
