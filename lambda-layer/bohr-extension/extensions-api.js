const { basename } = require('path');
let fetch = null;

const baseUrl = `http://${process.env.AWS_LAMBDA_RUNTIME_API}/2020-01-01/extension`;

async function register() {
    if (fetch == null) fetch = (await import('node-fetch')).default;
    const res = await fetch(`${baseUrl}/register`, {
        method: 'post',
        body: JSON.stringify({
            'events': [
                'INVOKE',
                'SHUTDOWN'
            ],
        }),
        headers: {
            'Content-Type': 'application/json',
            'Lambda-Extension-Name': basename(__dirname),
        }
    });

    if (!res.ok) {
        console.error('register failed', await res.text());
    }

    return res.headers.get('lambda-extension-identifier');
}

async function next(extensionId) {
    if (fetch == null) fetch = (await import('node-fetch')).default;
    const res = await fetch(`${baseUrl}/event/next`, {
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            'Lambda-Extension-Identifier': extensionId,
        }
    });

    if (!res.ok) {
        console.error('next failed', await res.text());
        return null;
    }

    return await res.json();
}

module.exports = {
    register,
    next,
};

