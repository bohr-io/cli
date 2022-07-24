import * as https from 'https';
import * as portfinder from 'portfinder';
import { EventEmitter } from 'events';
import { Tunnel } from './tunnel';
import { b64ToBuf } from '../utils'

export interface MainServerOptions {
    tunnel: Tunnel,
    port?: number;
}

export class MainServer extends EventEmitter {
    public opts: MainServerOptions;
    public port?: number;
    public host?: string;
    private key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA3vvCySfxrQlQudBDO3TuIDydkM/LR1cn6iPz6GVkKNPf0Gye\nJsOETp3Upoqth9goQ1lbaBHSljybtKhAQyMU00egrBPMWZDsKOHuLyuUtQT8Bzla\neUpu7ah8vnfRcmX5AOZgbxsst9GS9taJGiZiemsFM3qCLTISnwoRZ8bC2+njF7Ad\nnXFkPCiI9rG/gZ4DpxOx7LydEJDjMxRHysj8oC+HVufUMz8mpVcGCDmlFavnlmpL\nDqJxphDpO/p+LrSkIur7cEK5QPAFNJKs+EvYpD7MeHMkZ8uQgRP8Ptm9p8P2gEga\nJWemlkyFqKuZyNxtFm04//qd49sOpe9OlkPVXQIDAQABAoIBACzmy5GQLpVmk8/n\nBTLa1/y72ArKHSgPf+UhOkNo72NdTut8g9hQdLsUAzdKI6mAOJNfUg3B0QMZz0zw\nuIgMb2wgN1WPYw4CJdwRqtHq17Yf+9REk1hrSa0nyX7dR9red+bbfT3CXh3h4NM9\n3jva0OfP1ytHlyEcvS0zbM/V8XUw4qEeVvSsAfxbsJsdsaHbK3yfZl2mwYMBEWON\nPkWDeK9xUDqM9xVpuod7p9cAM1IPbw+iIfp1AJAfnaHW0W53egblMYXOTwFM9QLj\nrmoy+NAFjCQCgCi1JqrpDu2MtYLuO7CH21mxlTBYUDlOcFNPjlFlw3jV9MFasRKR\n7KQRIc0CgYEA8498OwpY3YGOZPkcxNQj7zuSnAxiympAlwySa4PPrJihwzu0m7nF\nZQDr0C4Sf6NErnJi1ljnwvpC+QVwI4AunzdiBzyWEGgMaLu8X3QbXqh+m5lnzGR8\nGSKR21Ngv07oFSTWewSOxymBT/oCpyTC/fS9OLvMCHHmkoXPH9f7cPMCgYEA6l87\n5SeDZf8uev70EyXPBLsPHtFpanw1P6Bf9KB7m4KY9xtt2Xk1KjvqktrA5C+Pr5D8\nYxC6LXTOgXCNWxBtwv9MMK+YKL+ETRPa89cSLRGu7FhyNcBcVuofoH2vXa11xlcC\nqlRytDT0oi9CFeSGCIPmVp28X818thAzIXShtG8CgYEAipZrnwCtPiUZDDV/fDQl\n2luweaDGmdzJselSa2EOS2xyJzAS/cVAH8/dXpDIr94MF6M4wDTIc3aJoz7H5ztp\ny+jsm6eKz/0UiofAkSP06vC/UfSBTpkiz/6OthkEZPcWMenLLSaTw5nHXeWpmsfd\nODoJbX3WhDujcl43VCxGg6cCgYAqRw+Y4K3VQljyGveQVKupYMzzdDcd3FYGqjlk\n+WYSwVYyjSIdrr2mZrSD1S4ie2nh87dzb1sGRCHUO6dkG+yQ1li6F5LNFu8YsFI4\n1j0TIDN7suC3TYHas9UMsF9n+JhcNOnoK9+dHkha0UeMh3KeKpzsVvvaFElA1l9C\n07UvxQKBgQCp9E6kFsuOObywOr7k/goZvzER/8c1Gi1U0mABLTz7caAPcjoSVWWD\nqWBszLXo/TXIZCCJ7ouI4LBQcof202fAXJ4Mym1qQg+qjgxzB026YGfiBy1d2Ipt\n9GHFfojc1Y7pXMCc1YEyFeCLQVoekVn+aEHpYEtcN5BLdGXY4ySSOg==\n-----END RSA PRIVATE KEY-----';
    private cert = '-----BEGIN CERTIFICATE-----\nMIIDczCCAlugAwIBAgIJXuZP17XjRJiAMA0GCSqGSIb3DQEBCwUAMBQxEjAQBgNV\nBAMTCWxvY2FsaG9zdDAeFw0yMjA1MDkwNDE1MDVaFw0zMjA1MDYwNDE1MDVaMBQx\nEjAQBgNVBAMTCWxvY2FsaG9zdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC\nggEBAN77wskn8a0JULnQQzt07iA8nZDPy0dXJ+oj8+hlZCjT39BsnibDhE6d1KaK\nrYfYKENZW2gR0pY8m7SoQEMjFNNHoKwTzFmQ7Cjh7i8rlLUE/Ac5WnlKbu2ofL53\n0XJl+QDmYG8bLLfRkvbWiRomYnprBTN6gi0yEp8KEWfGwtvp4xewHZ1xZDwoiPax\nv4GeA6cTsey8nRCQ4zMUR8rI/KAvh1bn1DM/JqVXBgg5pRWr55ZqSw6icaYQ6Tv6\nfi60pCLq+3BCuUDwBTSSrPhL2KQ+zHhzJGfLkIET/D7ZvafD9oBIGiVnppZMhair\nmcjcbRZtOP/6nePbDqXvTpZD1V0CAwEAAaOBxzCBxDAMBgNVHRMEBTADAQH/MAsG\nA1UdDwQEAwIC9DAxBgNVHSUEKjAoBggrBgEFBQcDAQYIKwYBBQUHAwIGCCsGAQUF\nBwMDBggrBgEFBQcDCDB0BgNVHREEbTBrgglsb2NhbGhvc3SHEP6AAAAAAAAAnB73\nZ4v2XJGHBMCoOAGHEP6AAAAAAAAAhb/g3lZJbdeHBMCoD3SHEAAAAAAAAAAAAAAA\nAAAAAAGHBH8AAAGHEP6AAAAAAAAA1CY5iaZTg06HBKwR7zEwDQYJKoZIhvcNAQEL\nBQADggEBAGL2nVqwf6BrblJOU0e9LIA77ETXdkKz+gFrDFb14PTh9tIS3QfDEH6S\nDcMovitUVoS5/zkIJ8YSU+yovwRVz8MR1OVxVev4iW9IZ/iQuESCRCG9vfAPgT3z\nuGxN0Do6DwHUVNMkc9NUlQDNzTx56G4kTBzX/jFCifpcwv3aItE7njzoM2fM3KyV\nHjTRahz79TRSWfHbAnren1pp+lgkdMwW2eYT5eQwejTtsZpm7JwYGogZRrDCulvJ\nYZfaCE6pqTIrCLE6MWRgrb4fB0AxMtIOVSACQORimeA/bX5DoXHLoqnoYLfZYlna\nhgM5IKNI9DR3d9I+ipwQua614xqLtgc=\n-----END CERTIFICATE-----';

    constructor(opts: MainServerOptions) {
        super();
        this.opts = Object.assign(
            {
                port: 443,
            },
            opts
        );
    }

    public async run() {
        this.port = await portfinder.getPortPromise({ port: this.opts.port });
        this.host = 'localhost' + (this.port != 443 ? ':' + this.port : '');
        https.createServer({
            key: this.key,
            cert: this.cert,
        }, async (req, res) => {
            let a: any = new Date();
            const buffers = [];
            for await (const chunk of req) buffers.push(chunk);
            const ret = await this.opts.tunnel.sendRequest(req, Buffer.concat(buffers));
            delete ret.headers['connection'];
            delete ret.headers['content-encoding'];
            delete ret.headers['x-powered-by'];
            delete ret.headers['accept-ranges'];
            delete ret.headers['vary'];
            delete ret.headers['etag'];
            delete ret.headers['transfer-encoding'];
            res.writeHead(ret.status, ret.headers);
            res.end(new Uint8Array((ret.isBase64) ? b64ToBuf(ret.body) : ret.body));
        }).listen(this.port, 'localhost');
        this.emit("ready");
    }
}