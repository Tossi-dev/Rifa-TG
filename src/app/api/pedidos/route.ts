import { NextResponse } from "next/server";

import { LIMITES, RIFA } from "@/lib/config";
import { criarCobrancaPix } from "@/lib/pagamento";
import {
  consumirLimite,
  devolverLimite,
  liberarVagaPendente,
  reservarVagaPendente,
  buscarVendedor,
  expirarPedido,
  indexarPedido,
  resumo,
  salvarPedido,
  type Pedido,
  type ResultadoLimite,
} from "@/lib/store";
import { codigoValido } from "@/lib/vendedores";
import {
  cpfValido,
  inteiroDoCorpo,
  limparDigitos,
  nomeValido,
  textoDoCorpo,
  whatsappValido,
} from "@/lib/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Corpo cru do POST — cada campo é validado antes de virar pedido. */
interface CorpoCompra {
  nome?: unknown;
  whatsapp?: unknown;
  cpf?: unknown;
  cotas?: unknown;
  vendedor?: unknown;
}

function novoId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return (t + r).toUpperCase();
}

/**
 * IP do comprador atrás do proxy da Vercel.
 * Devolve `null` quando não dá para saber — nesse caso NÃO aplicamos limite
 * por IP, para não jogar todos os desconhecidos no mesmo balde e barrar
 * gente inocente. Quem segura o abuso aí é o limite por CPF.
 */
function ipDoPedido(req: Request): string | null {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) {
    const primeiro = encaminhado.split(",")[0].trim();
    if (primeiro) return primeiro;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

const erro = (mensagem: string, status: number) =>
  NextResponse.json({ erro: mensagem }, { status });

/**
 * Cria o pedido e a cobrança Pix — SEM atribuir números.
 *
 * Os números só saem na confirmação do pagamento (ver `confirmarPagamento`).
 * Enquanto o comprador não paga, nada fica preso: quem abandona a tela não
 * tira cota nenhuma da rifa, e não existe prazo a vigiar nem varredura a
 * rodar.
 */
export async function POST(req: Request) {
  let corpo: CorpoCompra;
  try {
    corpo = (await req.json()) as CorpoCompra;
  } catch {
    return erro("Requisição inválida.", 400);
  }

  /* 1. Validação estrita de tipo (nada de objeto virando string). */
  const nome = textoDoCorpo(corpo?.nome, 80);
  const whatsappCru = textoDoCorpo(corpo?.whatsapp, 30);
  const cpfCru = textoDoCorpo(corpo?.cpf, 20);
  const cotas = inteiroDoCorpo(corpo?.cotas);

  if (!nome || !nomeValido(nome)) return erro("Informe seu nome completo.", 400);
  const whatsapp = limparDigitos(whatsappCru ?? "");
  if (!whatsappValido(whatsapp)) {
    return erro("Informe um WhatsApp válido com DDD.", 400);
  }
  const cpf = limparDigitos(cpfCru ?? "");
  if (!cpfValido(cpf)) return erro("CPF inválido.", 400);
  if (cotas === null || cotas < RIFA.minCotas || cotas > RIFA.maxCotasPorCompra) {
    return erro(
      `A quantidade precisa ser um número inteiro entre ${RIFA.minCotas} e ${RIFA.maxCotasPorCompra} cotas.`,
      400
    );
  }

  /* 2. Freio de abuso: por IP, por CPF e por cobranças em aberto.
        A vaga é reservada de forma atômica (grava e conta) para que uma
        rajada simultânea não fure o teto — e devolvida em todo caminho que
        NÃO virar pedido, para tentativa recusada não entupir a janela de
        ninguém (nem a da própria vítima do 429). */
  const janela = LIMITES.janelaMinutos * 60_000;
  const ip = ipDoPedido(req);
  const chaveIp = ip ? `ip:${ip}` : null;
  const chaveCpf = `cpf:${cpf}`;

  const usoIp = chaveIp
    ? await consumirLimite(chaveIp, LIMITES.pedidosPorIp, janela)
    : null;
  if (usoIp && !usoIp.permitido) {
    return erro(
      "Muitas tentativas deste dispositivo. Aguarde alguns minutos.",
      429
    );
  }

  let usoCpf: ResultadoLimite | null = null;
  let vagaPendenteTomada = false;

  const id = novoId();
  const agora = Date.now();
  const expiraEm = agora + RIFA.minutosPix * 60_000;

  /** Devolve as vagas consumidas. Use em todo retorno que não seja 201. */
  const devolverVagas = async (): Promise<void> => {
    if (chaveIp && usoIp) {
      await devolverLimite(chaveIp, usoIp.marca).catch(() => {});
    }
    if (usoCpf) await devolverLimite(chaveCpf, usoCpf.marca).catch(() => {});
    if (vagaPendenteTomada) {
      await liberarVagaPendente(cpf, id).catch(() => {});
    }
  };

  usoCpf = await consumirLimite(chaveCpf, LIMITES.pedidosPorCpf, janela);
  if (!usoCpf.permitido) {
    await devolverVagas();
    return erro("Muitos pedidos para este CPF. Aguarde alguns minutos.", 429);
  }

  /* Teto de cobranças em aberto por CPF. Já não existe risco de travar a
     rifa (pedido pendente não segura número), mas sem o teto um laço trivial
     abre milhares de cobranças no gateway em segundos. */
  const vagaPendente = await reservarVagaPendente(
    cpf,
    id,
    expiraEm,
    LIMITES.pendentesPorCpf
  );
  vagaPendenteTomada = vagaPendente.permitido;
  if (!vagaPendente.permitido) {
    await devolverVagas();
    return erro(
      "Você já tem cobranças aguardando pagamento. Pague ou espere o prazo terminar.",
      429
    );
  }

  /* 3. Conferência de disponibilidade — informativa, não é reserva.
        Serve para não cobrar Pix de quem não teria como receber número. A
        decisão real acontece na confirmação do pagamento, de forma atômica:
        se a rifa esgotar entre esta conferência e o pagamento, o pedido entra
        na fila de reembolso em vez de virar cota vendida. */
  const disponivel = await resumo();
  if (disponivel.disponiveis < cotas) {
    await devolverVagas();
    return erro(
      disponivel.disponiveis > 0
        ? `Restam apenas ${disponivel.disponiveis} cotas. Reduza a quantidade para continuar.`
        : "As cotas desta rifa se esgotaram.",
      409
    );
  }

  const valor = Number((cotas * RIFA.precoCota).toFixed(2));

  /* Vendedor: registrado quando existe e está ativo, ignorado em silêncio
     quando não. Código inválido NUNCA recusa a compra — o comprador não tem
     como saber o que é um código de vendedor, e derrubar uma venda de R$ 150
     porque um link veio truncado no WhatsApp é o pior negócio possível. A
     venda entra como direta e aparece assim no painel. */
  const vendedorCru = textoDoCorpo(corpo?.vendedor, 40);
  let vendedor: string | null = null;
  if (vendedorCru && codigoValido(vendedorCru)) {
    const cadastro = await buscarVendedor(vendedorCru).catch(() => null);
    if (cadastro?.ativo) vendedor = cadastro.codigo;
  }

  const pedido: Pedido = {
    id,
    nome,
    whatsapp,
    cpf,
    cotas,
    valor,
    numeros: [], // só na confirmação do pagamento
    status: "pendente",
    criadoEm: agora,
    expiraEm,
    pagoEm: null,
    provedor: "demonstracao",
    idPagamento: null,
    codigoPix: null,
    imagemQrCode: null,
    vendedor,
  };

  /* 4. Grava o pedido ANTES de falar com o gateway, para que uma notificação
        de pagamento que chegue rápido demais já encontre o pedido no banco. */
  try {
    await salvarPedido(pedido);
    await indexarPedido(id);
  } catch (e) {
    await devolverVagas();
    console.error("Falha ao registrar o pedido:", e);
    return erro("Não conseguimos registrar seu pedido agora. Tente de novo.", 500);
  }

  /* 5. Gera a cobrança Pix. */
  try {
    const cobranca = await criarCobrancaPix({
      idPedido: id,
      valor,
      cotas,
      nome,
      cpf,
      expiraEm,
    });

    await salvarPedido({
      ...pedido,
      provedor: cobranca.provedor,
      idPagamento: cobranca.idPagamento,
      codigoPix: cobranca.codigoPix,
      imagemQrCode: cobranca.imagemQrCode,
    });

    /* 6. Deu certo: as vagas consumidas no passo 2 ficam gastas — este
          pedido existe de verdade. */
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    // Deu ruim no Pix: encerra o pedido (não há número para devolver).
    await expirarPedido(pedido).catch(() => {});
    await devolverVagas();
    console.error("Falha ao gerar o Pix:", e);
    return erro(
      "Não foi possível gerar o Pix agora. Tente de novo em instantes.",
      502
    );
  }
}
