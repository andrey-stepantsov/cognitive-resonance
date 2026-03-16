const fs = require('fs');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');

async function test() {
  const dir = __dirname + '/.test-git-' + Date.now();
  fs.mkdirSync(dir);
  await git.init({ fs, dir });
  fs.writeFileSync(dir + '/test.txt', 'hello world');
  await git.add({ fs, dir, filepath: 'test.txt' });
  await git.commit({ fs, dir, author: { name: 'test', email: 'test@example.com' }, message: 'init' });

  // Add the remote
  await git.addRemote({ fs, dir, remote: 'origin', url: 'https://cr-vector-pipeline.andrey-stepantsov.workers.dev/git/test-session-bot' });

  console.log('Pushing...');
  try {
    const res = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: 'main',
      headers: {
        'Authorization': 'Bearer 91116e4269933bda17ca6e870695790abf679feb15bbd36587081d4404a454e0'
      }
    });
    console.log('Success:', res);
  } catch (err) {
    console.error('Push Failed:', err);
  }
}
test();
