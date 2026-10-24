import { posix } from 'node:path';
import type { ProjectSnapshot } from './project-types.js';
const fold = (text: string) => text.normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase();
export function analyzeRequest(prompt: string, snapshot: ProjectSnapshot, pending?: string) {
  const openingAnswer = /^(?:o )?(?:arquivo|direto|index\.html|file:)|\babri\b|https?:\/\//.test(fold(prompt));
  const intent = pending && openingAnswer ? `${pending}\nAbertura informada: ${prompt}` : prompt;
  const text = fold(intent), answer = fold(prompt);
  const html = snapshot.files.filter(f => /\.html?$/i.test(f.path));
  const webDebug = html.length > 0 && /clic|botao|pagina|site|tela|navegador|browser|interface/.test(text)
    && /nao.{0,35}(?:funcion|consig|conseg|clic|respond)|erro ao|deu erro|falhando|\bbug\b|travou|quebrou/.test(text);
  const modules = html.some(f => /<script\b[^>]*\btype\s*=\s*['"]module['"]/i.test(f.content));
  const servers = snapshot.files.filter(f => /\.[cm]?js$/.test(f.path) && /createServer|\.listen\(/.test(f.content));
  let command: string | null = null, url: string | null = null;
  try {
    const scripts = JSON.parse(snapshot.files.find(f => f.path === 'package.json')?.content ?? '{}')?.scripts;
    for (const name of ['web', 'dev', 'start']) {
      if (typeof scripts?.[name] !== 'string') continue;
      const server = servers.find(f => scripts[name].includes(f.path));
      if (!server) continue;
      command = name === 'start' ? 'npm start' : `npm run ${name}`;
      const port = Number(/\.listen\(\s*(\d{1,5})\b/.exec(server.content)?.[1]);
      if (port > 0 && port <= 65535) url = `http://localhost:${port}`;
      break;
    }
  } catch { /* No launch command is inferred from an invalid manifest. */ }
  const directFile = /file:\/\/|abri.{0,35}(?:arquivo|diret|index)|direto.{0,25}(?:arquivo|html)|arquivo.{0,25}diret|^(?:o )?(?:arquivo|index\.html)$/.test(answer);
  const served = /https?:\/\/(?:localhost|127\.0\.0\.1)|pelo servidor|npm (?:run |start)/.test(answer);
  const focus = new Set<string>();
  if (webDebug) {
    for (const file of html) {
      focus.add(file.path);
      for (const match of file.content.matchAll(/\bsrc\s*=\s*['"]([^'"?#]+)(?:[?#][^'"]*)?['"]/g)) {
        const src = match[1]!;
        const path = src.startsWith('/') ? src.slice(1) : posix.normalize(posix.join(posix.dirname(file.path), src));
        if (snapshot.files.some(f => f.path === path)) focus.add(path);
      }
    }
    for (const file of servers) focus.add(file.path);
    for (const file of snapshot.files) if (/web|browser|dom|html/i.test(file.path) && /test|spec/i.test(file.path)) focus.add(file.path);
  }
  const local = modules && (webDebug || pending) && directFile && !served && !/https?:\/\//.test(answer)
    ? { kind: 'answer' as const, message: command
      ? `Abra pelo servidor: execute ${command} e acesse ${url ?? 'o endereço exibido no terminal'}. O HTML aberto direto não carrega os módulos corretamente.`
      : 'Essa página usa módulos. Abra pelo servidor HTTP do projeto, não diretamente pelo arquivo HTML.' }
    : webDebug && modules && !served && !/https?:\/\//.test(text)
      ? { kind: 'question' as const, message: `Você abriu o HTML direto ou pelo endereço do servidor?${command ? ' Para iniciar: ' + command + '.' : ''}` }
      : null;
  return { intent, webDebug, focus: [...focus], local, command, url };
}
