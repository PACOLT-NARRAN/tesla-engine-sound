# Cesta k prodeji REVLINE: co a v jakém pořadí

Tenhle list říká, **co udělat a v jakém pořadí**, aby se dalo prodávat PRO a balíčky motorů.
Technické detaily jsou v [BACKEND.md](BACKEND.md). Návod na Supabase je v
[SETUP-SUPABASE.md](SETUP-SUPABASE.md).

Pravidlo: **každý krok potřebuje jen ty předchozí.** Nic nekupuj dopředu.

| # | Krok | Kdo | Potřebuje doménu? | Cena |
|---|---|---|---|---|
| 1 | Supabase: přihlášení e-mailovým kódem (jen pro tebe) | ty | **ne** | zdarma |
| 2 | Vybrat název a koupit doménu, připojit ji ke GitHub Pages | ty + já | — | stovky Kč ročně |
| 3 | Odesílání e-mailů z domény (Resend) → přihlásit se může kdokoli | ty | ano | zdarma na začátek |
| 4 | Právní stránky na webu (podmínky, vrácení peněz, soukromí, kontakt) | já napíšu, ty zkontroluješ | ano | zdarma |
| 5 | Účet Paddle: ověření totožnosti a kontrola webu | ty | ano | zdarma (Paddle si bere % z prodeje) |
| 6 | Programování nákupů (M2) a test v Paddle Sandbox | já | ne (sandbox) | zdarma |
| 7 | PRO zvuky do soukromého úložiště (M3), pak ostrý prodej | já + ty | ano | Supabase Pro až při prodeji |

## 1. Supabase (teď)

- Postupuj podle [SETUP-SUPABASE.md](SETUP-SUPABASE.md), kroky 1–7.
- Doména **není potřeba**. Site URL je adresa GitHub Pages.
- Kód přijde **jen na tvůj e-mail** (e-mail tvého účtu v Supabase). Supabase bez vlastního
  odesílání e-mailů nic jiného nedovolí. Na ověření, že přihlášení funguje, to stačí.

## 2. Doména

Proč je potřeba:
- Paddle kontroluje web, na kterém se prodává. Adresa `pacolt-narran.github.io` na to není vhodná.
- E-maily s kódy musí chodit z tvé domény (krok 3), jinak se nedostanou k ostatním lidem.

Co udělat:
1. Vymysli název (například `revline.cz` nebo `revline.app`) a ověř, že je volný.
2. Kup doménu u registrátora (například Forpsi, Wedos nebo Cloudflare).
3. Napiš mi ji. Připravím změnu aplikace (adresa bez `/tesla-engine-sound/`) a přesný návod,
   co nastavit u registrátora a na GitHubu. GitHub Pages vlastní doménu i HTTPS zvládne zdarma.

## 3. E-maily pro všechny

- Postupuj podle [SETUP-SUPABASE.md](SETUP-SUPABASE.md), krok 8 (Resend + Custom SMTP).
- Pak se může přihlásit kdokoli.

## 4. Právní stránky

Paddle je vyžaduje před schválením. Napíšu je česky a anglicky:
- obchodní podmínky, včetně věty, že prodejcem je Paddle.com (Merchant of Record);
- pravidla vrácení peněz;
- zásady ochrany osobních údajů (GDPR);
- kontakt a tvoje celé jméno jako provozovatele.

Ty mezitím: s účetní nebo na živnostenském úřadě ověř, jestli potřebuješ živnostenský list a jak
danit příjmy od Paddle. To za tebe vyřešit nemůžu.

## 5. Paddle

1. Zaregistruj se na paddle.com a ověř totožnost (doklad).
2. Zadej doménu z kroku 2. Paddle zkontroluje web a právní stránky z kroku 4.
3. Počkej na schválení. Může to trvat i několik dní.

## 6. Programování nákupů (M2)

Můžu začít hned po kroku 1, souběžně s kroky 2–5. Testuje se v **Paddle Sandbox**, kde se platí
testovacími kartami a nic se neúčtuje. Sandbox je samostatný účet a schválení nepotřebuje.

## 7. Ostrý prodej

- Zvuky PRO a balíčků přesunu ze složky `public/audio` (dnes si je může stáhnout kdokoli)
  do soukromého úložiště Supabase.
- Supabase přepneš na placený plán Pro, aby se projekt neuspával.
- Přepnu aplikaci ze Sandboxu na ostrý Paddle.

---

**Teď je na řadě jen krok 1.** Až bude hotový, pošli mi fotku Profil → Účet po přihlášení.
