/* =========================================================================
 *  Upstash Redis REST FALSO, para testes.
 *
 *  Fala o mesmo protocolo do Upstash (POST com um array JSON de argumentos e
 *  resposta `{ "result": ... }`) e adiciona LATÊNCIA artificial em cada
 *  chamada. A latência é o que faz as corridas aparecerem: entre duas
 *  chamadas do mesmo processo existe uma janela real em que outro processo
 *  age. A execução do comando em si é síncrona (um único tick), igual ao
 *  Redis de verdade, que é single-threaded.
 * ========================================================================= */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type Conteudo =
  | { tipo: "texto"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "zset"; membros: Map<string, number> }
  | { tipo: "hash"; campos: Map<string, string> };

/** Valor guardado + validade (o Upstash de verdade honra TTL; o falso também). */
type Valor = Conteudo & { venceEm?: number };

/**
 * Decide se um comando deve falhar.
 *
 * Devolver um status HTTP (ex.: 500) derruba a chamada ANTES de executar.
 * Devolver `{ status, executar: true }` executa o comando e SÓ ENTÃO responde
 * erro — que é o caso mais traiçoeiro de todos: a escrita valeu, mas quem
 * chamou acha que falhou e tenta compensar.
 */
export type Sabotagem = (
  args: string[],
  ordem: number
) => number | { status: number; executar?: boolean } | null | undefined;

export interface UpstashFalso {
  url: string;
  token: string;
  /**
   * Faz comandos falharem, para exercitar os caminhos de compensação.
   *
   * Sem isto o dublê descreve um Redis que nunca cai — e é exatamente na queda
   * que este sistema pode perder dinheiro. Passe `null` para desligar.
   */
  sabotar: (regra: Sabotagem | null) => void;
  /** Quantos comandos o servidor executou (útil para medir chamadas). */
  comandos: () => number;
  /** Espia o estado interno, sem passar pelo protocolo. */
  banco: Map<string, Valor>;
  lista: (chave: string) => string[];
  zset: (chave: string) => Map<string, number>;
  texto: (chave: string) => string | null;
  hash: (chave: string) => Map<string, string>;
  /** Segundos que faltam para a chave vencer (-1 sem TTL, -2 inexistente). */
  ttl: (chave: string) => number;
  /** Escreve direto no banco, sem passar pelo protocolo (para montar cenário). */
  semear: (chave: string, texto: string, ttlSegundos?: number) => void;
  fechar: () => Promise<void>;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function limite(valor: string): number {
  if (valor === "-inf" || valor === "-INF") return Number.NEGATIVE_INFINITY;
  if (valor === "+inf" || valor === "+INF" || valor === "inf") {
    return Number.POSITIVE_INFINITY;
  }
  // Redis aceita "(10" para exclusivo; aqui tratamos como inclusivo mesmo.
  return Number(valor.replace("(", ""));
}

/** Expiração preguiçosa: chave vencida deixa de existir na próxima leitura. */
function limparVencidas(banco: Map<string, Valor>): void {
  const agora = Date.now();
  for (const [chave, valor] of banco) {
    if (valor.venceEm !== undefined && valor.venceEm <= agora) banco.delete(chave);
  }
}

function executar(banco: Map<string, Valor>, args: string[]): unknown {
  limparVencidas(banco);
  const cmd = String(args[0] ?? "").toUpperCase();
  const chave = args[1];

  const pegarLista = (criar: boolean): string[] | null => {
    const atual = banco.get(chave);
    if (atual?.tipo === "lista") return atual.itens;
    if (atual) return null;
    if (!criar) return null;
    const nova: Valor = { tipo: "lista", itens: [] };
    banco.set(chave, nova);
    return nova.itens;
  };

  const pegarHash = (criar: boolean): Map<string, string> | null => {
    const atual = banco.get(chave);
    if (atual?.tipo === "hash") return atual.campos;
    if (atual) return null;
    if (!criar) return null;
    const nova: Valor = { tipo: "hash", campos: new Map() };
    banco.set(chave, nova);
    return nova.campos;
  };

  const pegarZset = (criar: boolean): Map<string, number> | null => {
    const atual = banco.get(chave);
    if (atual?.tipo === "zset") return atual.membros;
    if (atual) return null;
    if (!criar) return null;
    const nova: Valor = { tipo: "zset", membros: new Map() };
    banco.set(chave, nova);
    return nova.membros;
  };

  switch (cmd) {
    case "PING":
      return "PONG";

    /* EVAL não interpreta Lua: reconhece pelo texto os scripts que o store
       usa e executa o equivalente em JavaScript, dentro do mesmo tick — que é
       exatamente a garantia que o Redis dá a um script. Script desconhecido
       explode de propósito: é melhor o teste quebrar do que testar mentira. */
    case "EVAL": {
      const script = String(args[1]).trim();
      const chaves = Number(args[2]);
      const chaveScript = String(args[3]);
      const argv = args.slice(3 + chaves).map(String);

      if (script.includes("if atual + quantos > total then return -1 end")) {
        const quantos = Number(argv[0]);
        const total = Number(argv[1]);
        const valor = banco.get(chaveScript);
        const atual = valor?.tipo === "texto" ? Number(valor.texto) : 0;
        if (atual + quantos > total) return -1;
        const novo = atual + quantos;
        banco.set(chaveScript, { tipo: "texto", texto: String(novo) });
        return novo;
      }

      if (script.includes("local pedido = ARGV[3]")) {
        const [cursorKey, livresKey, numerosKey, pedidoKey, todosKey] = args.slice(
          3,
          3 + chaves
        );
        const total = Number(argv[0]);
        const id = argv[1];
        const pedido = argv[2];
        const numeros = argv.slice(3).map(Number);
        const cursorAtual = banco.get(cursorKey);
        let cursor = cursorAtual?.tipo === "texto" ? Number(cursorAtual.texto) : 0;

        if (banco.has(pedidoKey)) return [0, "pedido", id];

        const indiceAtual = banco.get(numerosKey);
        const indice =
          indiceAtual?.tipo === "hash" ? indiceAtual.campos : new Map<string, string>();
        const livresAtual = banco.get(livresKey);
        const livres = livresAtual?.tipo === "lista" ? livresAtual.itens : [];

        for (const numero of numeros) {
          if (!Number.isInteger(numero) || numero < 1 || numero > total) {
            return [0, "invalido", String(numero)];
          }
          if (indice.has(String(numero))) return [0, "ocupado", String(numero)];
          if (numero <= cursor && !livres.includes(String(numero))) {
            return [0, "indisponivel", String(numero)];
          }
        }

        for (const numero of numeros) {
          if (numero <= cursor) {
            livres.splice(livres.indexOf(String(numero)), 1);
          } else {
            for (let livre = cursor + 1; livre < numero; livre++) livres.push(String(livre));
            cursor = numero;
          }
          indice.set(String(numero), id);
        }

        banco.set(cursorKey, { tipo: "texto", texto: String(cursor) });
        if (livres.length) banco.set(livresKey, { tipo: "lista", itens: livres });
        if (!indiceAtual) banco.set(numerosKey, { tipo: "hash", campos: indice });
        banco.set(pedidoKey, { tipo: "texto", texto: pedido });
        const todosAtual = banco.get(todosKey);
        const todos = todosAtual?.tipo === "lista" ? todosAtual.itens : [];
        todos.push(id);
        if (!todosAtual) banco.set(todosKey, { tipo: "lista", itens: todos });
        return [1];
      }

      if (script.includes("redis.call('DEL', KEYS[1])")) {
        const valor = banco.get(chaveScript);
        const dono = valor?.tipo === "texto" ? valor.texto : null;
        if (dono !== argv[0]) return 0;
        banco.delete(chaveScript);
        return 1;
      }

      throw new Error(`Script Lua não reconhecido pelo Upstash falso: ${script}`);
    }

    case "GET": {
      const atual = banco.get(chave);
      return atual?.tipo === "texto" ? atual.texto : null;
    }

    case "SET": {
      const opcoes = args.slice(3).map((o) => String(o).toUpperCase());
      const existe = banco.has(chave);
      if (opcoes.includes("NX") && existe) return null;
      if (opcoes.includes("XX") && !existe) return null;
      const posEx = opcoes.indexOf("EX");
      const novo: Valor = { tipo: "texto", texto: String(args[2]) };
      if (posEx >= 0) {
        novo.venceEm = Date.now() + Number(args[3 + posEx + 1]) * 1000;
      }
      banco.set(chave, novo);
      return "OK";
    }

    case "SETNX": {
      if (banco.has(chave)) return 0;
      banco.set(chave, { tipo: "texto", texto: String(args[2]) });
      return 1;
    }

    case "DEL": {
      let apagados = 0;
      for (const k of args.slice(1)) if (banco.delete(k)) apagados++;
      return apagados;
    }

    case "EXISTS":
      return banco.has(chave) ? 1 : 0;

    case "EXPIRE": {
      const valor = banco.get(chave);
      if (!valor) return 0;
      valor.venceEm = Date.now() + Number(args[2]) * 1000;
      return 1;
    }

    case "TTL": {
      const valor = banco.get(chave);
      if (!valor) return -2;
      if (valor.venceEm === undefined) return -1;
      return Math.ceil((valor.venceEm - Date.now()) / 1000);
    }

    case "INCRBY":
    case "DECRBY": {
      const atual = banco.get(chave);
      const base = atual?.tipo === "texto" ? Number(atual.texto) : 0;
      const passo = Number(args[2]) * (cmd === "DECRBY" ? -1 : 1);
      const novo = base + passo;
      banco.set(chave, { tipo: "texto", texto: String(novo) });
      return novo;
    }

    case "LPOP": {
      const itens = pegarLista(false);
      if (!itens || itens.length === 0) return args.length > 2 ? [] : null;
      if (args.length > 2) return itens.splice(0, Number(args[2]));
      return itens.shift() ?? null;
    }

    case "RPUSH": {
      const itens = pegarLista(true);
      if (!itens) throw new Error("WRONGTYPE");
      itens.push(...args.slice(2).map(String));
      return itens.length;
    }

    case "LLEN":
      return pegarLista(false)?.length ?? 0;

    case "LRANGE": {
      const itens = pegarLista(false) ?? [];
      const inicio = Number(args[2]);
      const fimBruto = Number(args[3]);
      const fim = fimBruto < 0 ? itens.length + fimBruto : fimBruto;
      return itens.slice(inicio < 0 ? itens.length + inicio : inicio, fim + 1);
    }

    case "HSET": {
      const campos = pegarHash(true);
      if (!campos) throw new Error("WRONGTYPE");
      let novos = 0;
      for (let i = 2; i + 1 < args.length; i += 2) {
        const campo = String(args[i]);
        if (!campos.has(campo)) novos++;
        campos.set(campo, String(args[i + 1]));
      }
      return novos;
    }

    case "HGET": {
      const campos = pegarHash(false);
      return campos?.get(String(args[2])) ?? null;
    }

    case "HDEL": {
      const campos = pegarHash(false);
      if (!campos) return 0;
      let removidos = 0;
      for (const c of args.slice(2)) if (campos.delete(String(c))) removidos++;
      return removidos;
    }

    case "HGETALL": {
      const campos = pegarHash(false);
      if (!campos) return [];
      /* Formato de fio do Upstash: lista achatada campo, valor, campo,
         valor... Não é objeto. Devolver objeto aqui esconderia um bug que só
         apareceria em produção. */
      return [...campos.entries()].flat();
    }

    case "HLEN":
      return pegarHash(false)?.size ?? 0;

    case "ZADD": {
      const membros = pegarZset(true);
      if (!membros) throw new Error("WRONGTYPE");
      let novos = 0;
      for (let i = 2; i < args.length; i += 2) {
        const membro = String(args[i + 1]);
        if (!membros.has(membro)) novos++;
        membros.set(membro, Number(args[i]));
      }
      return novos;
    }

    case "ZREM": {
      const membros = pegarZset(false);
      if (!membros) return 0;
      let removidos = 0;
      for (const m of args.slice(2)) if (membros.delete(String(m))) removidos++;
      return removidos;
    }

    case "ZCARD":
      return pegarZset(false)?.size ?? 0;

    case "ZRANK": {
      const membros = pegarZset(false);
      if (!membros) return null;
      const alvo = String(args[2]);
      if (!membros.has(alvo)) return null;
      // Mesma ordenação do Redis: por nota e, no empate, pelo membro.
      const fila = [...membros.entries()].sort(
        (a, b) => a[1] - b[1] || a[0].localeCompare(b[0])
      );
      return fila.findIndex(([membro]) => membro === alvo);
    }

    case "ZSCORE": {
      const membros = pegarZset(false);
      const nota = membros?.get(String(args[2]));
      return nota === undefined ? null : String(nota);
    }

    case "ZRANGEBYSCORE": {
      const membros = pegarZset(false);
      if (!membros) return [];
      const min = limite(String(args[2]));
      const max = limite(String(args[3]));
      let saida = [...membros.entries()]
        .filter(([, nota]) => nota >= min && nota <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([membro]) => membro);
      const posLimite = args.findIndex((a) => a.toUpperCase() === "LIMIT");
      if (posLimite > 0) {
        const desvio = Number(args[posLimite + 1]);
        const quantos = Number(args[posLimite + 2]);
        saida = saida.slice(desvio, quantos < 0 ? undefined : desvio + quantos);
      }
      return saida;
    }

    case "ZREMRANGEBYSCORE": {
      const membros = pegarZset(false);
      if (!membros) return 0;
      const min = limite(String(args[2]));
      const max = limite(String(args[3]));
      let removidos = 0;
      for (const [membro, nota] of [...membros.entries()]) {
        if (nota >= min && nota <= max) {
          membros.delete(membro);
          removidos++;
        }
      }
      return removidos;
    }

    default:
      throw new Error(`Comando não suportado no Upstash falso: ${cmd}`);
  }
}

/** Sobe o servidor falso numa porta livre (ou na porta informada). */
export async function iniciarUpstashFalso(
  opcoes: { latenciaMs?: number; token?: string; porta?: number } = {}
): Promise<UpstashFalso> {
  const latencia = opcoes.latenciaMs ?? 8;
  const token = opcoes.token ?? "token-de-teste";
  const banco = new Map<string, Valor>();
  let comandos = 0;
  let sabotagem: Sabotagem | null = null;

  const servidor: Server = createServer((req, res) => {
    const pedacos: Buffer[] = [];
    req.on("data", (p: Buffer) => pedacos.push(p));
    req.on("end", () => {
      void (async () => {
        // Latência de rede ANTES de executar: é aqui que a corrida acontece.
        await dormir(latencia + Math.random() * latencia);

        if (req.headers.authorization !== `Bearer ${token}`) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "token invalido" }));
          return;
        }
        try {
          const args = JSON.parse(
            Buffer.concat(pedacos).toString("utf8") || "[]"
          ) as string[];
          comandos++;

          const regra = sabotagem?.(args, comandos);
          const falha =
            typeof regra === "number" ? { status: regra, executar: false } : regra;
          if (falha?.status) {
            if (falha.executar) executar(banco, args);
            res.writeHead(falha.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "sabotado pelo teste" }));
            return;
          }

          const result = executar(banco, args);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ result }));
        } catch (erro) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(erro) }));
        }
      })();
    });
  });

  await new Promise<void>((pronto) =>
    servidor.listen(opcoes.porta ?? 0, "127.0.0.1", pronto)
  );
  const porta = (servidor.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${porta}`,
    token,
    comandos: () => comandos,
    sabotar: (regra) => {
      sabotagem = regra;
    },
    banco,
    lista: (chave) => {
      const v = banco.get(chave);
      return v?.tipo === "lista" ? [...v.itens] : [];
    },
    zset: (chave) => {
      const v = banco.get(chave);
      return v?.tipo === "zset" ? new Map(v.membros) : new Map();
    },
    texto: (chave) => {
      const v = banco.get(chave);
      return v?.tipo === "texto" ? v.texto : null;
    },
    hash: (chave) => {
      const v = banco.get(chave);
      return v?.tipo === "hash" ? new Map(v.campos) : new Map();
    },
    ttl: (chave) => {
      const v = banco.get(chave);
      if (!v) return -2;
      if (v.venceEm === undefined) return -1;
      return Math.ceil((v.venceEm - Date.now()) / 1000);
    },
    semear: (chave, texto, ttlSegundos) => {
      const valor: Valor = { tipo: "texto", texto };
      if (ttlSegundos !== undefined) {
        valor.venceEm = Date.now() + ttlSegundos * 1000;
      }
      banco.set(chave, valor);
    },
    fechar: () =>
      new Promise<void>((pronto) => {
        servidor.close(() => pronto());
      }),
  };
}
