import { NextResponse } from "next/server";

import { barrarSeNaoForAdmin } from "@/lib/admin";
import { RIFA } from "@/lib/config";
import {
  buscarVendedor,
  NumeroIndisponivel,
  registrarVendaManual,
  type Pedido,
} from "@/lib/store";
import {
  cpfValido,
  limparDigitos,
  nomeValido,
  textoDoCorpo,
  whatsappValido,
} from "@/lib/validacao";
import { codigoValido } from "@/lib/vendedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) =>
  NextResponse.json({ erro: mensagem }, { status });

interface CorpoVendaManual {
  nome?: unknown;
  whatsapp?: unknown;
  cpf?: unknown;
  vendedor?: unknown;
  numeros?: unknown;
}

function novoIdManual(): string {
  return `MAN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

/** Aceita `1, 3-5, 20` e devolve uma lista sem repetição, em ordem. */
function lerNumeros(valor: unknown): number[] | null {
  if (typeof valor !== "string") return null;
  const partes = valor
    .trim()
    .replace(/\s*-\s*/g, "-")
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!partes.length) return null;

  const encontrados = new Set<number>();
  for (const parte of partes) {
    const intervalo = parte.match(/^(\d+)-(\d+)$/);
    const unico = parte.match(/^\d+$/);
    const inicio = Number(intervalo?.[1] ?? unico?.[0]);
    const fim = Number(intervalo?.[2] ?? unico?.[0]);
    if (
      !Number.isInteger(inicio) ||
      !Number.isInteger(fim) ||
      inicio < 1 ||
      fim < inicio ||
      fim > RIFA.totalCotas ||
      fim - inicio + 1 > RIFA.maxCotasPorCompra
    ) {
      return null;
    }
    for (let n = inicio; n <= fim; n++) encontrados.add(n);
    if (encontrados.size > RIFA.maxCotasPorCompra) return null;
  }
  return [...encontrados].sort((a, b) => a - b);
}

/**
 * Registra vendas feitas fora do checkout. Só o administrador pode marcar uma
 * venda como paga; cada número entra no mesmo índice usado pelo sorteio e pelo
 * checkout, portanto não pode ser reutilizado depois.
 */
export async function POST(req: Request) {
  const recusa = await barrarSeNaoForAdmin(req);
  if (recusa) return recusa;

  let corpo: CorpoVendaManual;
  try {
    corpo = (await req.json()) as CorpoVendaManual;
  } catch {
    return erro("Requisição inválida.", 400);
  }

  const nome = textoDoCorpo(corpo.nome, 80);
  const whatsapp = limparDigitos(textoDoCorpo(corpo.whatsapp, 30) ?? "");
  const cpf = limparDigitos(textoDoCorpo(corpo.cpf, 20) ?? "");
  const vendedor = textoDoCorpo(corpo.vendedor, 40)?.toLowerCase() ?? "";
  const numeros = lerNumeros(corpo.numeros);

  if (!nome || !nomeValido(nome)) return erro("Informe o nome completo do comprador.", 400);
  if (!whatsappValido(whatsapp)) return erro("Informe um WhatsApp válido com DDD.", 400);
  if (cpf && !cpfValido(cpf)) return erro("CPF inválido.", 400);
  if (!numeros) {
    return erro(
      `Informe de 1 a ${RIFA.maxCotasPorCompra} números, por exemplo: 12, 20-23, 45.`,
      400
    );
  }
  if (!codigoValido(vendedor) || !(await buscarVendedor(vendedor))) {
    return erro("Escolha um vendedor cadastrado.", 400);
  }

  const agora = Date.now();
  const pedido: Pedido = {
    id: novoIdManual(),
    nome,
    whatsapp,
    cpf,
    cotas: numeros.length,
    valor: Number((numeros.length * RIFA.precoCota).toFixed(2)),
    numeros,
    status: "pago",
    criadoEm: agora,
    expiraEm: agora,
    pagoEm: agora,
    provedor: "manual",
    idPagamento: null,
    codigoPix: null,
    imagemQrCode: null,
    vendedor,
  };

  try {
    await registrarVendaManual(pedido);
    return NextResponse.json({ id: pedido.id, numeros: pedido.numeros }, { status: 201 });
  } catch (e) {
    if (e instanceof NumeroIndisponivel) {
      return erro(`O número ${e.numero} já está vendido ou indisponível.`, 409);
    }
    console.error("Falha ao registrar venda manual:", e);
    return erro("Não foi possível registrar a venda agora. Tente de novo.", 500);
  }
}
