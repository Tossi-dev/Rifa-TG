import { describe, expect, it } from "vitest";

import {
  caminhoBarra,
  caminhoSuave,
  escalaY,
  margemEsquerda,
} from "./graficos";

/**
 * Amostra uma Bézier cúbica em `passos` pontos.
 *
 * Existe porque a garantia da curva suavizada não é sobre os pontos que ela
 * liga — é sobre TUDO que ela desenha entre eles. Conferir só os extremos
 * deixaria passar exatamente o defeito que a trava previne.
 */
function amostrarCaminho(d: string, passos = 400): Array<{ x: number; y: number }> {
  const partes = d.trim().split(/(?=[MC])/);
  let atual = { x: 0, y: 0 };
  const saida: Array<{ x: number; y: number }> = [];

  for (const parte of partes) {
    const numeros = parte
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parte.startsWith("M")) {
      atual = { x: numeros[0], y: numeros[1] };
      saida.push(atual);
      continue;
    }
    const [c1x, c1y, c2x, c2y, fx, fy] = numeros;
    const p0 = atual;
    for (let k = 1; k <= passos; k++) {
      const t = k / passos;
      const u = 1 - t;
      saida.push({
        x: u ** 3 * p0.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * fx,
        y: u ** 3 * p0.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * fy,
      });
    }
    atual = { x: fx, y: fy };
  }
  return saida;
}

describe("curva suavizada", () => {
  it("nunca ultrapassa o valor real dos pontos que liga", () => {
    /* O defeito que este teste guarda: Catmull-Rom sem trava, entre um dia de
       40 cotas e um de 300, empurra a curva acima de 300 — e o gráfico passa
       a afirmar um pico de venda que nunca aconteceu. Em zigue-zague o erro
       aparece nas duas direções. */
    const pontos = [
      { x: 0, y: 200 },
      { x: 50, y: 40 },
      { x: 100, y: 195 },
      { x: 150, y: 10 },
      { x: 200, y: 180 },
      { x: 250, y: 30 },
    ];
    const amostras = amostrarCaminho(caminhoSuave(pontos, 0.2));

    const menorY = Math.min(...pontos.map((p) => p.y));
    const maiorY = Math.max(...pontos.map((p) => p.y));
    const minimo = Math.min(...amostras.map((a) => a.y));
    const maximo = Math.max(...amostras.map((a) => a.y));

    expect(minimo).toBeGreaterThanOrEqual(menorY - 1e-9);
    expect(maximo).toBeLessThanOrEqual(maiorY + 1e-9);
  });

  it("não desce entre dois valores crescentes — o acumulado só sobe", () => {
    /* Num acumulado, uma descida é impossível por definição. A curva não pode
       inventar uma: quem olhasse o painel leria "perdemos dinheiro no dia 4". */
    const pontos = [
      { x: 0, y: 240 },
      { x: 60, y: 238 },
      { x: 120, y: 120 },
      { x: 180, y: 116 },
      { x: 240, y: 20 },
    ];
    const amostras = amostrarCaminho(caminhoSuave(pontos, 0.2));

    // y do SVG cresce para baixo: acumulado subindo = y sempre decrescente.
    for (let i = 1; i < amostras.length; i++) {
      expect(amostras[i].y).toBeLessThanOrEqual(amostras[i - 1].y + 1e-9);
    }
  });

  it("liga exatamente os pontos recebidos, sem arredondar as pontas", () => {
    const pontos = [
      { x: 10, y: 100 },
      { x: 40, y: 60 },
      { x: 70, y: 90 },
    ];
    const d = caminhoSuave(pontos);
    expect(d.startsWith("M 10 100")).toBe(true);
    expect(d.endsWith("70 90")).toBe(true);
  });

  it("aguenta zero e um ponto sem quebrar", () => {
    expect(caminhoSuave([])).toBe("");
    expect(caminhoSuave([{ x: 5, y: 5 }])).toBe("M 5 5");
  });
});

describe("barra", () => {
  it("mantém a base reta, encostada na linha do zero", () => {
    /* `rx` no <rect> arredonda os quatro cantos, e o canto de baixo descola a
       barra do eixo — a âncora no zero vira sugestão. O caminho tem que
       terminar com um traço horizontal fechando na base. */
    const d = caminhoBarra(10, 20, 40, 100);
    expect(d).toContain("a 3 3 0 0 1"); // topo arredondado
    expect(d.replace(/\s+/g, " ")).toContain("v 97 h -40 Z"); // base reta
  });

  it("não arredonda mais que a barra comporta", () => {
    // Numa barra de 6px de largura, raio 3 já é metade: não pode passar disso.
    const estreita = caminhoBarra(0, 0, 6, 100);
    expect(estreita).toContain("a 1.5 1.5");
    // Barra mais baixa que o raio vira retângulo puro, sem arco.
    expect(caminhoBarra(0, 0, 40, 2)).not.toContain("a ");
  });
});

describe("margem do eixo", () => {
  it("cresce o bastante para o maior rótulo não ser cortado", () => {
    const formatar = (v: number, unidade: boolean) =>
      unidade ? `R$ ${v / 1000} mil` : `${v / 1000} mil`;
    const { marcas } = escalaY(100_000);
    const margem = margemEsquerda(marcas, formatar);

    const maior = marcas.reduce(
      (m, v) => Math.max(m, formatar(v, v === marcas[marcas.length - 1]).length),
      0
    );
    /* O SVG corta em x=0: se a margem não couber o rótulo, o "R" sai fatiado
       ao meio na borda do cartão. */
    expect(margem).toBeGreaterThanOrEqual(maior * 6.1);
  });

  it("nunca encolhe abaixo do piso, mesmo com rótulos curtos", () => {
    const { marcas } = escalaY(4);
    expect(margemEsquerda(marcas, (v) => String(v))).toBe(56);
  });
});
