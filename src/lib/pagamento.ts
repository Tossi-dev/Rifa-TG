/* =========================================================================
 *  Pix automático.
 *
 *  Com MP_ACCESS_TOKEN configurado, cria uma cobrança Pix real no Mercado
 *  Pago e recebe a confirmação por webhook.
 *
 *  Sem o token, o site entra em MODO DEMONSTRAÇÃO: gera um Pix fictício
 *  (com QR Code de verdade, só que sem destino) para que todo o fluxo possa
 *  ser testado de ponta a ponta antes de plugar a conta do cliente.
 * ========================================================================= */

import crypto from "node:crypto";
import QRCode from "qrcode";
import { RIFA } from "./config";

const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
export const modoDemo = !MP_TOKEN;

/**
 * O botão que confirma pagamento sem pagar nada.
 *
 * Só existir em modo demonstração NÃO basta: subir para produção antes de
 * cadastrar o `MP_ACCESS_TOKEN` (ou o token ser removido do painel depois) põe
 * o site inteiro em modo demonstração na internet aberta, e aí qualquer
 * visitante confirma os próprios pedidos e leva a rifa de graça.
 *
 * Por isso, em produção, a simulação exige um "sim" explícito por variável de
 * ambiente. Esquecimento passa a derrubar a simulação, não a arrecadação.
 */
const emServidorPublicado =
  /* Preview conta como publicado: é comum o MP_ACCESS_TOKEN existir só em
     Production enquanto o Upstash é o MESMO nos três ambientes. Um preview em
     modo demonstração apontando para o banco de produção confirmaria pedidos
     de graça, consumindo cotas reais da rifa. */
  (process.env.VERCEL_ENV !== undefined &&
    process.env.VERCEL_ENV !== "development") ||
  (process.env.VERCEL_ENV === undefined &&
    process.env.NODE_ENV === "production");

export const simulacaoLiberada =
  modoDemo &&
  (!emServidorPublicado ||
    process.env.PERMITIR_SIMULACAO_EM_PRODUCAO === "sim");

/** Resposta (parcial) da API de pagamentos do Mercado Pago. */
interface RespostaPagamentoMP {
  id?: string | number;
  status?: string;
  message?: string;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string };
  };
}

export interface CobrancaPix {
  provedor: "mercadopago" | "demonstracao";
  idPagamento: string;
  codigoPix: string; // Pix copia e cola
  imagemQrCode: string; // data URL (PNG) do QR Code
}

/**
 * Endereço público do site, sempre normalizado.
 *
 * Variável de ambiente colada no painel costuma vir com espaço, quebra de
 * linha ou barra no fim. Sem limpar, o `notification_url` sai corrompido
 * (`https://site.com\n/api/...`) e o webhook do Mercado Pago nunca chega.
 */
export function baseUrl(): string {
  const bruto =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return bruto.trim().replace(/\/+$/, "");
}

/* ------------------------------------------------------- Pix copia e cola */

function campo(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "");

/** Monta um BR Code (Pix copia e cola) no padrão EMV. */
export function montarBrCode(opts: {
  chave: string;
  nome: string;
  cidade: string;
  valor: number;
  txid: string;
}) {
  const mai =
    campo("00", "br.gov.bcb.pix") + campo("01", opts.chave);
  let payload =
    campo("00", "01") +
    campo("26", mai) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", opts.valor.toFixed(2)) +
    campo("58", "BR") +
    campo("59", semAcento(opts.nome).slice(0, 25).trim() || "RIFA") +
    campo("60", semAcento(opts.cidade).slice(0, 15).trim() || "ITARARE") +
    campo("62", campo("05", opts.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25)));
  payload += "6304";
  return payload + crc16(payload);
}

/* --------------------------------------------------------- Criar cobrança */

export async function criarCobrancaPix(dados: {
  idPedido: string;
  valor: number;
  cotas: number;
  nome: string;
  cpf: string;
  expiraEm: number;
}): Promise<CobrancaPix> {
  const descricao = `${RIFA.titulo} - ${dados.cotas} ${
    dados.cotas === 1 ? "cota" : "cotas"
  }`;

  /* ---------------------------------------------------- Modo demonstração */
  if (modoDemo) {
    const brcode = montarBrCode({
      chave: "demonstracao@rifa.local",
      nome: RIFA.organizador,
      cidade: RIFA.cidade.split("-")[0],
      valor: dados.valor,
      txid: dados.idPedido,
    });
    return {
      provedor: "demonstracao",
      idPagamento: `demo_${dados.idPedido}`,
      codigoPix: brcode,
      imagemQrCode: await QRCode.toDataURL(brcode, { margin: 1, width: 460 }),
    };
  }

  /* ----------------------------------------------------------- Mercado Pago */
  const [primeiro, ...resto] = dados.nome.trim().split(/\s+/);
  const body = {
    transaction_amount: Number(dados.valor.toFixed(2)),
    description: descricao,
    payment_method_id: "pix",
    external_reference: dados.idPedido,
    notification_url: `${baseUrl()}/api/webhooks/mercadopago`,
    date_of_expiration: new Date(dados.expiraEm).toISOString().replace("Z", "-00:00"),
    payer: {
      email: `rifa+${dados.idPedido}@${new URL(baseUrl()).hostname}`,
      first_name: primeiro,
      last_name: resto.join(" ") || primeiro,
      identification: { type: "CPF", number: dados.cpf.replace(/\D/g, "") },
    },
  };

  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": dados.idPedido,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json()) as RespostaPagamentoMP;
  if (!res.ok) {
    throw new Error(
      `Mercado Pago (${res.status}): ${json?.message ?? JSON.stringify(json)}`
    );
  }

  const tx = json?.point_of_interaction?.transaction_data;
  if (!tx?.qr_code) throw new Error("Mercado Pago não retornou o QR Code do Pix.");

  return {
    provedor: "mercadopago",
    idPagamento: String(json.id),
    codigoPix: tx.qr_code,
    imagemQrCode: tx.qr_code_base64
      ? `data:image/png;base64,${tx.qr_code_base64}`
      : await QRCode.toDataURL(tx.qr_code, { margin: 1, width: 460 }),
  };
}

/* ------------------------------------------------------ Consultar status - */

/**
 * Cache da última consulta ao Mercado Pago, por pagamento.
 *
 * O comprador faz polling de 4 em 4 segundos e a página ainda consulta no
 * render: sem cache seriam ~450 chamadas à API do MP por comprador, o que
 * derruba o limite de requisições da conta. O estado local continua sendo
 * lido rápido; só a ida ao MP é espaçada.
 */
const INTERVALO_CONSULTA_MP = 20_000;

interface ConsultaMP {
  quando: number;
  aprovado: boolean;
}

const cacheMP = ((
  globalThis as unknown as { __rifaCacheMP?: Map<string, ConsultaMP> }
).__rifaCacheMP ??= new Map<string, ConsultaMP>());

/**
 * Três respostas possíveis — e a terceira é a que salva dinheiro.
 *
 * "Não sei" (o Mercado Pago não respondeu, ou respondeu 429/5xx) NÃO pode ser
 * tratado como "não aprovado": quem chama usaria isso para responder 200 ao
 * webhook, o MP marcaria a notificação como entregue, pararia de reenviar, e
 * um pagamento aprovado sumiria sem virar cota nem registro de reembolso.
 */
export type SituacaoPagamento = "aprovado" | "nao-aprovado" | "indeterminado";

export async function consultarPagamento(
  idPagamento: string,
  opcoes: { forcar?: boolean } = {}
): Promise<SituacaoPagamento> {
  // No modo demo a confirmação é manual, pelo botão de teste.
  if (modoDemo) return "nao-aprovado";

  const agora = Date.now();
  const anterior = cacheMP.get(idPagamento);
  if (
    !opcoes.forcar &&
    anterior &&
    agora - anterior.quando < INTERVALO_CONSULTA_MP
  ) {
    return anterior.aprovado ? "aprovado" : "nao-aprovado";
  }

  let res: Response;
  try {
    res = await fetch(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    console.error("Mercado Pago inacessível:", e);
    return "indeterminado";
  }

  if (!res.ok) {
    // Um "aprovado" já confirmado antes continua valendo; o resto é incerteza.
    if (anterior?.aprovado) return "aprovado";
    console.error(`Mercado Pago respondeu ${res.status} para ${idPagamento}`);
    return "indeterminado";
  }

  const json = (await res.json()) as RespostaPagamentoMP;
  const aprovado = json?.status === "approved";
  cacheMP.set(idPagamento, { quando: agora, aprovado });
  return aprovado ? "aprovado" : "nao-aprovado";
}

/**
 * Versão simples para a tela do comprador, onde "não sei" e "ainda não" dão no
 * mesmo: a página só continua esperando. Quem decide dinheiro (o webhook) usa
 * `consultarPagamento` e trata os três casos.
 */
export async function pagamentoAprovado(
  idPagamento: string,
  opcoes: { forcar?: boolean } = {}
): Promise<boolean> {
  return (await consultarPagamento(idPagamento, opcoes)) === "aprovado";
}

/* ------------------------------------------- Assinatura do webhook (MP) -- */

/** Tolerância do carimbo de tempo da assinatura (anti-replay). */
export const JANELA_ASSINATURA_MS = 10 * 60_000;

export function assinaturaValida(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // sem segredo configurado, não bloqueia (validamos via API mesmo assim)
  if (!opts.xSignature) return false;

  const partes = Object.fromEntries(
    opts.xSignature.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=").trim()];
    })
  ) as Record<string, string>;

  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  /* Anti-replay: assinatura velha não vale mais. Sem isso, quem interceptar
     uma notificação legítima pode reenviá-la para sempre. O MP manda `ts` em
     segundos; aceitamos milissegundos também por segurança. */
  const bruto = Number(ts);
  if (!Number.isFinite(bruto)) return false;
  const emMs = bruto > 1e12 ? bruto : bruto * 1000;
  if (Math.abs(Date.now() - emMs) > JANELA_ASSINATURA_MS) return false;

  const manifest = `id:${(opts.dataId ?? "").toLowerCase()};request-id:${
    opts.xRequestId ?? ""
  };ts:${ts};`;
  const esperado = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1));
  } catch {
    return false;
  }
}
