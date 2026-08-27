/* =========================================================================
 *  CONFIGURAÇÃO DA RIFA  —  EDITE SÓ ESTE ARQUIVO
 *  Tudo que aparece no site (textos, preços, contatos, prêmios) vem daqui.
 * ========================================================================= */

export const RIFA = {
  /* --- Identidade ------------------------------------------------------ */
  organizador: "Tiro de Guerra 02-017",
  cidade: "Itararé - SP",
  titulo: "Rifa do Tiro de Guerra 02-017",
  subtitulo: "Itararé - SP",

  /* --- Regras da rifa -------------------------------------------------- */
  precoCota: 15.0, // R$ por número

  /**
   * LOTE ATUAL de números à venda — não é o teto definitivo da campanha.
   *
   * O organizador usa o lote como alavanca de escassez: abre 1.000, e quando
   * estiver perto de esgotar decide se abre mais. O painel avisa quando chegar
   * a hora. AUMENTAR é seguro (só relaxa o limite); DIMINUIR nunca — números já
   * vendidos ficariam fora do lote.
   *
   * Antes de aumentar, três coisas a conferir:
   *  1. Passar de 9.999 muda a largura do número (`formatarNumero`), e os
   *     comprovantes já impressos ficam com menos dígitos que os novos.
   *  2. A barra de progresso rebasa: quem viu "80% vendido" passa a ver menos.
   *  3. A chance de cada comprador cai. Quem comprou com 1.000 números
   *     concorria a 1/1.000. É decisão do organizador, mas precisa ser dele.
   */
  totalCotas: 1000,

  /**
   * Meta de arrecadação da campanha, em reais. É a referência do painel do
   * organizador — o ritmo necessário sai daqui e da data do sorteio.
   * Hoje R$ 20.000 exige mais de 1.333 cotas a R$ 15,00, ou seja, mais de um
   * lote. É proposital.
   */
  metaArrecadacao: 20000,

  minCotas: 1,
  /**
   * Teto por compra. Já não existe risco de travar a rifa (número só sai com
   * pagamento confirmado, cobrança aberta não segura nada); o teto continua
   * como freio de abuso no gateway e para manter o pedido num tamanho que o
   * comprador consiga conferir na tela.
   */
  maxCotasPorCompra: 50,

  // Botões de atalho na hora de escolher a quantidade.
  // "popular" destaca a opção com o selo "MAIS ESCOLHIDO".
  pacotes: [
    { cotas: 1, popular: false },
    { cotas: 5, popular: false },
    { cotas: 10, popular: true },
    { cotas: 20, popular: false },
    { cotas: 30, popular: false },
    { cotas: 50, popular: false },
  ],

  // Data do sorteio (fuso de Brasília). Formato: AAAA-MM-DDTHH:MM:SS-03:00
  dataSorteio: "2026-10-31T20:00:00-03:00",
  dataSorteioLabel: "31 de outubro de 2026",
  formaSorteio: "Extração da Loteria Federal do dia 31/10/2026",

  // Validade da cobrança Pix. Não segura número nenhum: os números são
  // atribuídos na confirmação do pagamento.
  minutosPix: 30,

  /* --- Contato --------------------------------------------------------- */
  // Só números: DDI + DDD + número. Ex.: 5515999998888
  whatsapp: "5515981461367",
  whatsappLabel: "(15) 98146-1367",
  instagram: "", // ex.: "tirodeguerra02017" (sem @) — deixe "" para esconder

  /* --- Prêmios --------------------------------------------------------- */
  premios: [
    {
      posicao: "1º prêmio",
      nome: "Full Electric FW2 1000W",
      chamada: "Autopropelido 100% elétrico",
      descricao:
        "Zero km, 100% elétrica, motor de 1000W e bateria de alta durabilidade. Econômica no dia a dia e sustentável — sem gasolina, sem óleo, sem barulho.",
      imagem: "/img/moto-premium.png",
      imagemEscura: true, // a foto tem fundo escuro, então o card usa fundo escuro
      destaques: [
        "100% elétrica",
        "Potência de 1000W",
        "Bateria de alta durabilidade",
        "Sustentável e econômica",
      ],
      parceiro: null as null | { nome: string; instagram?: string },
    },
    {
      posicao: "2º prêmio",
      nome: "01 diária no Espaço Famma",
      chamada: "Um dia inteiro para você e sua família",
      descricao:
        "Uma diária completa no Espaço Famma Eventos, com piscina e área de lazer para curtir com quem você gosta.",
      imagem: "/img/famma.webp",
      imagemEscura: false,
      destaques: ["Diária completa", "Piscina e área de lazer", "Espaço para eventos"],
      parceiro: { nome: "Famma Eventos", instagram: "" },
    },
    {
      posicao: "3º prêmio",
      nome: "Voucher de R$ 100,00",
      chamada: "The Best Açaí Itararé",
      descricao:
        "R$ 100,00 em voucher para gastar como quiser na The Best Açaí de Itararé.",
      imagem: "/img/acai.webp",
      imagemEscura: true,
      destaques: ["R$ 100,00 em crédito", "The Best Açaí Itararé"],
      parceiro: { nome: "The Best Açaí", instagram: "f.thebestitarare" },
    },
  ],

  /* --- Perguntas frequentes -------------------------------------------- */
  faq: [
    {
      p: "Como eu recebo os meus números?",
      r: "Assim que o Pix é confirmado, o sistema atribui os próximos números disponíveis e eles aparecem na tela na hora, já registrados no seu nome. Você também pode salvar o comprovante com os números e mandar para o seu WhatsApp.",
    },
    {
      p: "Posso escolher os meus números?",
      r: "Não. O sistema atribui automaticamente os próximos números disponíveis no momento em que o pagamento é confirmado, o que garante que ninguém fique com o mesmo número que o seu.",
    },
    {
      p: "Quanto tempo tenho para pagar?",
      r: "A cobrança Pix vale por 30 minutos. Como os números só são atribuídos depois do pagamento, deixar a tela aberta não tira cota de ninguém — e se o prazo passar é só refazer a compra, sem nada cobrado.",
    },
    {
      p: "Como vai ser o sorteio?",
      r: "O sorteio será realizado no dia 31 de outubro, com base na extração da Loteria Federal da mesma data. O resultado é público e pode ser conferido por qualquer participante.",
    },
    {
      p: "Como o ganhador é avisado?",
      r: "Entramos em contato pelo WhatsApp cadastrado na compra e também divulgamos o resultado nas redes do Tiro de Guerra 02-017.",
    },
    {
      p: "Posso comprar mais de um número?",
      r: "Pode, e quanto mais números, mais chances. Você escolhe a quantidade e paga tudo em um único Pix.",
    },
  ],

  /* --- Rodapé ---------------------------------------------------------- */
  textoLegal:
    "Ação entre amigos de caráter beneficente promovida pelo Tiro de Guerra 02-017 de Itararé - SP. A arrecadação é destinada às atividades da unidade.",
};

/* =========================================================================
 *  Limites de abuso. Sem isto, um laço trivial reserva a rifa inteira em
 *  milissegundos e trava as vendas até as reservas vencerem.
 * ========================================================================= */
export const LIMITES = {
  /**
   * Pedidos por IP na janela — teto ALTO de propósito.
   *
   * Rifa vendida por WhatsApp é comprada no celular, e operadora móvel
   * brasileira usa CGNAT: um bairro inteiro pode sair pelo mesmo IP. Quem
   * segura abuso de verdade é o limite por CPF e o teto de pendentes; o de IP
   * existe só para conter um laço automatizado.
   */
  pedidosPorIp: 120,
  /** Pedidos por CPF na janela. */
  pedidosPorCpf: 5,
  /** Tamanho da janela deslizante. */
  janelaMinutos: 10,
  /** Quantos pedidos pendentes o mesmo CPF pode ter em aberto ao mesmo tempo. */
  pendentesPorCpf: 3,
};

/* --- Helpers usados pelo site (não precisa mexer) ----------------------- */

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const linkWhatsApp = (texto: string) =>
  `https://wa.me/${RIFA.whatsapp}?text=${encodeURIComponent(texto)}`;

export type Premio = (typeof RIFA.premios)[number];
