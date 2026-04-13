const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Enter password to hash: ', async (password) => {
  if (!password || password.length < 6) {
    console.log('Password must be at least 6 characters.');
    rl.close();
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  console.log('\nBcrypt hash (paste this into your .env file):');
  console.log(hash);
  rl.close();
});
