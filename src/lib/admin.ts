/* =========================================================================
 *  Porta de entrada do organizador.
 *
 *  Uma única função guarda todas as rotas /api/admin/*. Sem ADMIN_TOKEN
 *  configurado a área inteira responde 404 — dado de comprador não pode ficar
 *  exposto por esquecimento de variável de ambiente.
 * ========================================================================= */

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { consumirLimite, devolverLimite } from "./store";

/** Tentativas de senha por IP antes do 429. */
const TENTATIVAS = 10;
const JANELA_MS = 5 * 60_000;

/**
 * Comparação de tempo constante que também não vaza o TAMANHO do segredo.
 *
 * Comparar comprimentos antes (`a.length !== b.length`) responde mais rápido
 * para tamanho errado do que para tamanho certo — o que entrega o comprimento
 * do token e encurta muito uma força bruta. Passando os dois por SHA-256
 * primeiro, toda comparação acontece sobre 32 bytes fixos.
 */
function iguais(a: string, b: string): boolean {
  const digerir = (v: string) => crypto.createHash("sha256").update(v).digest();
  return crypto.timingSafeEqual(digerir(a), digerir(b));
}

function ipDaRequisicao(req: Request): string {
  const encaminhado = req.headers.get("x-forwarded-for");
  const primeiro = encaminhado?.split(",")[0].trim();
  return primeiro || req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

/**
 * Devolve `null` quando o pedido está autorizado, ou a resposta de recusa.
 *
 * O token vem SÓ do cabeçalho `Authorization: Bearer`. Aceitar `?token=` era
 * cômodo para baixar o CSV por link, mas colocava o segredo do organizador no
 * log de acesso da Vercel, no histórico do navegador e em qualquer proxy do
 * caminho — junto do direito de ler nome e WhatsApp de todos os compradores.
 * O download agora é feito por `fetch` com cabeçalho.
 */
export async function barrarSeNaoForAdmin(
  req: Request
): Promise<NextResponse | null> {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  }

  const cabecalho = req.headers.get("authorization") ?? "";
  const informado = cabecalho.startsWith("Bearer ")
    ? cabecalho.slice(7).trim()
    : "";

  if (!informado) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  /* Freio de força bruta. Diferente da criação de pedido, aqui não há CPF nem
     nada que limite as tentativas: sem isto, um laço testa senhas para sempre
     contra a base de dados pessoais dos compradores. */
  const uso = await consumirLimite(
    `admin:${ipDaRequisicao(req)}`,
    TENTATIVAS,
    JANELA_MS
  );
  if (!uso.permitido) {
    return NextResponse.json(
      { erro: "Muitas tentativas. Aguarde alguns minutos." },
      { status: 429 }
    );
  }

  if (!iguais(informado, token)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  /* Acertou a senha: devolve a vaga. Sem isto o organizador se trancaria do
     lado de fora só de usar o painel normalmente. */
  if (uso.marca) {
    await devolverLimite(`admin:${ipDaRequisicao(req)}`, uso.marca).catch(
      (falha) => console.error("Falha ao devolver a vaga do admin:", falha)
    );
  }
  return null;
}
