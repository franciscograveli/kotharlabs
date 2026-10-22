# Revisão jurídica — /privacidade

> Este documento **não é aconselhamento jurídico**. Lista as suposições feitas ao redigir
> `src/pages/privacidade.astro` para que um advogado as confirme ou corrija antes de a página ser tratada como política final.

Última redação: 22/10/2026.

## O que o site realmente faz (fatos técnicos, para o advogado)
- Formulário coleta nome, e-mail, tipo (startup/empresa) e mensagem. Vai por e-mail (SMTP) para contato@kotharlabs.com; **não há banco de dados nem gravação em disco** no site.
- Sem cookies e sem fontes/scripts/imagens de terceiros (tudo servido do próprio domínio).
- **Medição de visitas própria (Umami 3.4.0 + Postgres, no mesmo servidor):** o script (`/medir.js`, ~1,2 KB) envia só caminho da página (sem query/hash), domínio de origem e cliques em botões de contato. Respeita Do Not Track e GPC. Sem cookies nem localStorage. O Umami deduz navegador, sistema, tipo de aparelho e país/região/cidade a partir dos cabeçalhos da requisição (UA e IP); o IP **não é gravado** (verificado no esquema do banco: não há coluna de IP). Não há `distinct_id`, tela nem idioma.
- Antispam: contagem de envios por IP **só em memória**, janela de 1 hora, sem registro.
- Registros de acesso (IP, data/hora, página) existem no nginx do contêiner e no proxy da VPS (Traefik/Coolify). Retenção hoje depende da rotação de logs do Docker/Coolify e **não foi medida**.

## Suposições a confirmar

| # | Suposição na página | O que confirmar |
|---|---|---|
| 1 | **Base legal:** consentimento (envio do formulário) e procedimentos preliminares a contrato, a pedido do titular (LGPD art. 7º, I e V), "conforme o caso". | Se essas bases são adequadas e suficientes; se o consentimento precisa de gesto/registro mais explícito (hoje há só um texto curto junto ao botão, sem caixa de aceite). |
| 2 | **Segurança/logs:** a página diz que os registros técnicos "servem à segurança do site", sem nomear base legal. Pensei em legítimo interesse (art. 7º, IX). | Qual base declarar para os logs e se é preciso teste de legítimo interesse documentado. |
| 3 | **Retenção de 12 meses** para mensagens de contato. **É uma suposição minha**, sugerida no pedido, não um número calculado. | Prazo adequado; critério de contagem (último contato?) e o que acontece se virar contrato (prazos fiscais/contratuais). |
| 4 | **Retenção dos logs:** "período curto, descartados em rotação". Não há prazo fixo. | Se é preciso declarar um prazo. Atenção ao Marco Civil da Internet (art. 15): provedores de aplicação constituídos como pessoa jurídica **devem guardar registros de acesso por 6 meses**; hoje não existe CNPJ. Confirmar se e quando isso se aplica e se conflita com o texto. |
| 5 | **Operadores:** "só o provedor de hospedagem e o de e-mail". Os provedores **não estão nomeados** na página. | Nomear ou não os operadores; contratos/termos de tratamento de dados com cada um; se a lista deve ser nominal. |
| 6 | **Transferência internacional:** a página **não menciona**. Se a VPS ou o provedor de e-mail estiverem fora do Brasil, há transferência internacional (LGPD arts. 33 a 36). | Onde ficam hoje a VPS e a caixa de e-mail; se precisa de cláusula/aviso específico na página. |
| 7 | **Ausência de CNPJ:** a página identifica o controlador só como "Kothar Labs" e pelo e-mail. Sem CNPJ nem endereço (de propósito, por ainda não existirem). | Quem é juridicamente o controlador hoje (a pessoa física dos sócios?); se a falta de identificação completa é aceitável até a abertura da empresa; indicação de encarregado (DPO) e se é exigível/dispensável para o porte. |
| 8 | **Prazo de resposta aos direitos:** "até 15 dias". Vem do art. 19, II, para a declaração completa; o prazo é a minha leitura. | Se o prazo e o canal (só e-mail) estão corretos e como será provada a identidade do titular. |
| 9 | **Direitos do art. 18:** lista parafraseada em linguagem simples. | Fidelidade da paráfrase; se a menção à ANPD é adequada. |
| 10 | **Cookies:** "não usa cookies, nem de rastreamento nem de medição". Verdadeiro hoje (a medição própria não usa cookies); **muda** se entrar outra ferramenta de terceiros. | Atualizar a página e avaliar banner de consentimento se entrar ferramenta de terceiros ou cookies. |
| 11 | **Menores de idade:** a página não trata do tema (o site é voltado a empresas). | Se é necessário algum aviso. |
| 12 | **Data de atualização** fixa em 22/10/2026 e sem histórico de versões. | Se é preciso versionar alterações. |
| 13 | **Medição de visitas:** tratada na página como medição anônima, sem base legal nomeada (a página só diz que serve a "entender o uso do site"). Pensei em legítimo interesse; se o dado for de fato anônimo, a LGPD pode nem se aplicar. | Se os dados do Umami são anônimos ou pessoais (há um identificador de sessão calculado a partir de IP + navegador com sal, e localização até cidade); qual base declarar; se basta o aviso na página ou se exige mecanismo de oposição além do Do Not Track. |
| 14 | **Retenção das estatísticas:** nenhuma regra automática; o Umami guarda indefinidamente. A página diz "sem prazo de descarte definido por enquanto". | Definir prazo e, depois, implementar a limpeza (o Umami não tem retenção automática). |

## Antes de publicar
- [ ] Advogado revisou a página e este documento.
- [ ] Prazos (12 meses, logs, 15 dias) decididos e, se necessário, ajustados no texto.
- [ ] Provedores e localização dos dados levantados (itens 5 e 6).
- [ ] CNPJ e endereço incluídos quando existirem (ver `TODO.md`).
