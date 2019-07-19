import execa from 'execa';

async function downloadRustToolchain(version: string = 'stable') {
  console.log('downloading the rust toolchain');

  try {
    let res = await execa.shell(
      `curl https://raw.githubusercontent.com/indigo-dc/udocker/master/udocker.py > udocker`,
      { stdio: 'inherit' }
    );

    console.log(`udocker downloaded:${res}`);

    res = await execa.shell(`chmod u+rx ./udocker`, { stdio: 'inherit' });

    console.log(`udocker permission changed:${res}`);

    res = await execa.shell(`./udocker install`, { stdio: 'inherit' });

    console.log(`udocker installed:${res}`);
  } catch (err) {
    throw new Error(`Failed to install rust via rustup: ${err.message}`);
  }

  try {
    await execa.shell(
      `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${version}`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    throw new Error(`Failed to install rust via rustup: ${err.message}`);
  }
}

async function installOpenSSL() {
  console.log('installing openssl-devel...');
  try {
    // need to downgrade otherwise yum can't resolve the dependencies given
    // a later version is already installed in the machine.
    await execa(
      'yum',
      ['downgrade', '-y', 'krb5-libs-1.14.1-27.41.amzn1.x86_64'],
      {
        stdio: 'inherit',
      }
    );
    await execa('yum', ['install', '-y', 'openssl-devel'], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('failed to `yum install -y openssl-devel`');
    throw err;
  }
}

export default async (version?: string) => {
  await downloadRustToolchain(version);
  await installOpenSSL();
};
