import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  JANELA_ASSINATURA_MS,
  assinaturaValida,
  baseUrl,
  montarBrCode,
} from "./pagamento";
import {
  cpfValido,
  formatarCpf,
  inteiroDoCorpo,
  nomeValido,
  textoDoCorpo,
  whatsappValido,
} from "./validacao";

describe("validação do comprador", () => {
  it("aceita CPF válido e recusa inválido", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("12345678900")).toBe(false);
  });

  it("exige nome e sobrenome", () => {
    expect(nomeValido("Maria Silva")).toBe(true);
    expect(nomeValido("Maria")).toBe(false);
  });

  it("exige WhatsApp com DDD", () => {
    expect(whatsappValido("(15) 99999-8888")).toBe(true);
    expect(whatsappValido("99999888")).toBe(false);
  });

  it("formata o CPF enquanto o comprador digita", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("tipos do corpo da requisição", () => {
  it("só aceita texto de verdade como texto", () => {
    expect(textoDoCorpo("  Maria   Silva ")).toBe("Maria Silva");
    // Antes, isto virava a string "[object Object]" e passava na validação.
    expect(textoDoCorpo({ a: 1 })).toBeNull();
    expect(textoDoCorpo(["Maria Silva"])).toBeNull();
    expect(textoDoCorpo(42)).toBeNull();
    expect(textoDoCorpo("   ")).toBeNull();
  });

  it("só aceita inteiro como quantidade de cotas", () => {
    expect(inteiroDoCorpo(3)).toBe(3);
    expect(inteiroDoCorpo("3")).toBe(3);
    // Antes: [3] era aceito e 2.7 cobrava 2 cotas sem avisar.
    expect(inteiroDoCorpo([3])).toBeNull();
    expect(inteiroDoCorpo(2.7)).toBeNull();
    expect(inteiroDoCorpo("2.7")).toBeNull();
    expect(inteiroDoCorpo(null)).toBeNull();
  });
});

/* ----------------------------------------------------------- BR Code ----- */

/**
 * CRC16/CCITT-FALSE calculado de forma independente (tabela montada na hora),
 * para o teste não repetir o mesmo algoritmo do código sob teste.
 */
function crc16Independente(texto: string): string {
  const tabela: number[] = [];
  for (let i = 0; i < 256; i++) {
    let valor = i << 8;
    for (let bit = 0; bit < 8; bit++) {
      valor =
        valor & 0x8000 ? ((valor << 1) ^ 0x1021) & 0xffff : (valor << 1) & 0xffff;
    }
    tabela[i] = valor;
  }
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "ascii")) {
    crc = ((crc << 8) & 0xffff) ^ tabela[((crc >> 8) ^ byte) & 0xff];
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

describe("BR Code do Pix", () => {
  const codigo = montarBrCode({
    chave: "demonstracao@rifa.local",
    nome: "Tiro de Guerra 02-017",
    cidade: "Itarare",
    valor: 300,
    txid: "PEDIDO123",
  });

  it("começa com o payload EMV padrão", () => {
    expect(codigo.startsWith("00020126")).toBe(true);
  });

  it("termina com o CRC16/CCITT-FALSE correto (valor exato, não regex)", () => {
    const semCrc = codigo.slice(0, -4);
    const crcNoCodigo = codigo.slice(-4);
    expect(semCrc.endsWith("6304")).toBe(true);
    expect(crcNoCodigo).toBe(crc16Independente(semCrc));
    // O teste antigo passava com "0000"; este não passa.
    expect(crcNoCodigo).not.toBe("0000");
  });

  it("recusa um CRC adulterado", () => {
    const adulterado = `${codigo.slice(0, -4)}0000`;
    expect(adulterado.slice(-4)).not.toBe(
      crc16Independente(adulterado.slice(0, -4))
    );
  });

  it("carrega o valor e o txid informados", () => {
    expect(codigo).toContain("5406300.00");
    expect(codigo).toContain("PEDIDO123");
  });
});

/* -------------------------------------------------------- Endereço base -- */

describe("baseUrl normalizado", () => {
  const original = process.env.NEXT_PUBLIC_BASE_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_BASE_URL = original;
  });

  it("remove quebra de linha, espaço e barra final", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://suarifa.com.br\n";
    expect(`${baseUrl()}/api/webhooks/mercadopago`).toBe(
      "https://suarifa.com.br/api/webhooks/mercadopago"
    );

    process.env.NEXT_PUBLIC_BASE_URL = " https://suarifa.com.br/// ";
    expect(`${baseUrl()}/api/webhooks/mercadopago`).toBe(
      "https://suarifa.com.br/api/webhooks/mercadopago"
    );
  });
});

/* ------------------------------------------------ Assinatura do webhook -- */

describe("assinatura do webhook do Mercado Pago", () => {
  const segredo = "segredo-de-teste";
  const dataId = "123456";
  const requestId = "req-abc";

  const assinar = (ts: number) => {
    const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = crypto
      .createHmac("sha256", segredo)
      .update(manifesto)
      .digest("hex");
    return `ts=${ts},v1=${v1}`;
  };

  const original = process.env.MP_WEBHOOK_SECRET;
  afterEach(() => {
    process.env.MP_WEBHOOK_SECRET = original;
  });

  it("aceita assinatura correta e recente", () => {
    process.env.MP_WEBHOOK_SECRET = segredo;
    const agora = Math.floor(Date.now() / 1000);
    expect(
      assinaturaValida({
        xSignature: assinar(agora),
        xRequestId: requestId,
        dataId,
      })
    ).toBe(true);
  });

  it("recusa assinatura adulterada", () => {
    process.env.MP_WEBHOOK_SECRET = segredo;
    const agora = Math.floor(Date.now() / 1000);
    expect(
      assinaturaValida({
        xSignature: `${assinar(agora)}0`,
        xRequestId: requestId,
        dataId,
      })
    ).toBe(false);
  });

  it("recusa replay: assinatura válida, porém velha", () => {
    process.env.MP_WEBHOOK_SECRET = segredo;
    const velho = Math.floor(
      (Date.now() - JANELA_ASSINATURA_MS - 60_000) / 1000
    );
    expect(
      assinaturaValida({
        xSignature: assinar(velho),
        xRequestId: requestId,
        dataId,
      })
    ).toBe(false);
  });
});
