import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';

const SSH_KEY_PATH = process.env.NETVIS_SSH_KEY_PATH || '/etc/netvis/id_ed25519';
const SSH_TIMEOUT_MS = parseInt(process.env.NETVIS_SSH_TIMEOUT_MS || '5000', 10);
const SSH_USERNAME = process.env.NETVIS_SSH_USERNAME || 'netvis';

const ALLOWED_COMMANDS = [
  'wg show wg0 dump',
  'iscsiadm -m session -P3',
  'showmount -e',
  'exportfs -v',
];

function isCommandAllowed(cmd) {
  return ALLOWED_COMMANDS.some((allowed) => cmd.startsWith(allowed));
}

let privateKey = null;

function getPrivateKey() {
  if (!privateKey) {
    try {
      privateKey = readFileSync(SSH_KEY_PATH, 'utf8');
    } catch (err) {
      console.error('[sshClient] Cannot read SSH key:', SSH_KEY_PATH, err.message);
      return null;
    }
  }
  return privateKey;
}

// NOTE: conn.exec() below is ssh2's SSH channel exec (RFC 4254),
// NOT child_process.exec(). Commands are validated against ALLOWED_COMMANDS
// and sent over the SSH protocol to the remote host's restricted shell.
export function sshRun(host, command) {
  if (!isCommandAllowed(command)) {
    return Promise.reject(new Error(`Command not allowed: ${command}`));
  }

  const key = getPrivateKey();
  if (!key) {
    return Promise.reject(new Error('SSH key not available'));
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH timeout after ${SSH_TIMEOUT_MS}ms: ${host}`));
    }, SSH_TIMEOUT_MS);

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            return reject(err);
          }
          stream
            .on('close', () => {
              clearTimeout(timer);
              conn.end();
              resolve(stdout);
            })
            .on('data', (data) => {
              stdout += data.toString();
            })
            .stderr.on('data', () => {
              // stderr ignored for read-only monitoring commands
            });
        });
      })
      .on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host,
        port: 22,
        username: SSH_USERNAME,
        privateKey: key,
        readyTimeout: SSH_TIMEOUT_MS,
      });
  });
}

// Parse `wg show wg0 dump` output into structured peer data
// First line is interface info, subsequent lines are peers
// Peer format: publickey\tpresharedkey\tendpoint\tallowed-ips\tlatest-handshake\ttransfer-rx\ttransfer-tx\tpersistent-keepalive
export function parseWgDump(output) {
  const lines = output.trim().split('\n');
  if (lines.length < 2) return [];

  return lines.slice(1).map((line) => {
    const parts = line.split('\t');
    return {
      publicKey: parts[0],
      endpoint: parts[2] === '(none)' ? null : parts[2],
      allowedIps: parts[3],
      lastHandshake: parts[4] === '0' ? null : parseInt(parts[4], 10),
      transferRx: parseInt(parts[5], 10) || 0,
      transferTx: parseInt(parts[6], 10) || 0,
    };
  });
}

// Parse `iscsiadm -m session -P3` output
export function parseIscsiSessions(output) {
  const sessions = [];
  let current = null;

  for (const line of output.split('\n')) {
    const targetMatch = line.match(/Target:\s+(.+)/);
    if (targetMatch) {
      current = { targetIqn: targetMatch[1], portal: null };
      sessions.push(current);
    }
    const portalMatch = line.match(/Current Portal:\s+(.+)/);
    if (portalMatch && current) {
      current.portal = portalMatch[1];
    }
  }

  return sessions;
}

// Parse `showmount -e` output
export function parseNfsExports(output) {
  const lines = output.trim().split('\n');
  return lines.slice(1).map((line) => {
    const [exportPath, clients] = line.split(/\s+/);
    return { exportPath, clients };
  });
}
