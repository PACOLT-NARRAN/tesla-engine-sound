# Zapnutí online účtu (Supabase) — návod krok za krokem

Tento návod zapne v aplikaci **Profil → Účet** (přihlášení e-mailovým kódem). Dokud ho neprojdeš,
aplikace funguje jako dřív a v sekci Účet píše „Online účet zatím není dostupný“.

Celé to je zdarma (Free plán Supabase). Trvá asi 15 minut.

> **Doména teď NENÍ potřeba.** Tenhle návod funguje s adresou GitHub Pages
> (`pacolt-narran.github.io/...`). Supabase ve zkušebním režimu ale posílá kódy **jen na e-maily
> členů tvého týmu v Supabase**, tedy hlavně na tvůj vlastní e-mail. Na testování to stačí.
> Aby se mohl přihlásit kdokoli, je potřeba vlastní doména a odesílání e-mailů (krok 8 níže).
> Celé pořadí kroků (Supabase → doména → Paddle) je v [POSTUP.md](POSTUP.md).

> **Bezpečnost:**
> - Do GitHubu dáváš jen **Project URL** a **Publishable key**. Ty dvě hodnoty jsou veřejné, tak to
>   Supabase navrhuje.
> - **Nikdy** nikam nekopíruj *secret key*, *service_role key* ani heslo databáze. Neposílej je ani
>   mně. Aplikace secret klíč sama odmítne, i kdyby se tam omylem dostal.

Názvy tlačítek v Supabase se občas trochu změní. Kdyby něco nesedělo, pošli fotku obrazovky.

---

## 1. Založ projekt

1. Otevři https://supabase.com a klikni na **Start your project**.
2. Přihlas se přes **Continue with GitHub** (tvůj účet PACOLT-NARRAN).
3. Klikni na **New project** a vyplň:
   - **Name:** `revline`
   - **Database Password:** klikni na *Generate a password* a ulož si ho do správce hesel. V aplikaci
     ho nepotřebujeme. Nikomu ho neposílej.
   - **Region:** **Central EU (Frankfurt)**. Kvůli GDPR je důležité, aby data byla v Evropě.
   - **Plan:** Free.
4. Klikni na **Create new project** a počkej asi 2 minuty, než se projekt připraví.

## 2. Nastav e-mail s kódem (místo odkazu)

Ve výchozím stavu Supabase posílá odkaz. V Tesle ale potřebujeme **kód**, který řidič opíše.

1. Vlevo otevři **Authentication**, pak **Emails** (nebo *Email Templates*).
2. Otevři šablonu **Magic Link**. Smaž obsah a vlož:
   - **Subject:** `REVLINE – přihlašovací kód`
   - **Body:**
     ```html
     <h2>REVLINE</h2>
     <p>Tvůj přihlašovací kód / Your sign-in code:</p>
     <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
     <p>Kód platí 1 hodinu. Pokud ses nepřihlašoval(a), e-mail ignoruj.</p>
     ```
3. Klikni na **Save**.
4. Totéž udělej se šablonou **Confirm signup**, která chodí novým uživatelům. Použij stejný text a
   **Save**.

## 3. Nastav adresu aplikace

1. Vlevo **Authentication**, pak **URL Configuration**.
2. **Site URL:** `https://pacolt-narran.github.io/tesla-engine-sound/`
3. Klikni na **Save**.

## 4. Zkopíruj dvě veřejné hodnoty

1. Vlevo dole otevři **Project Settings** (ozubené kolo), pak **API Keys** (nebo *Data API*).
2. Zkopíruj si do Poznámkového bloku:
   - **Project URL**, vypadá jako `https://abcdefgh.supabase.co`;
   - **Publishable key**, začíná `sb_publishable_…`. Pokud ho nevidíš, použij **anon public** key.
3. Klíč označený *secret* nebo *service_role* **nekopíruj**.

## 5. Vlož je do GitHubu (jako proměnné, ne tajemství)

1. Otevři https://github.com/PACOLT-NARRAN/tesla-engine-sound
2. Pokračuj na **Settings**, pak **Secrets and variables**, pak **Actions**.
3. Přepni na záložku **Variables** (ne *Secrets*).
4. Klikni na **New repository variable** a vytvoř dvě proměnné:
   - **Name:** `SUPABASE_URL`, **Value:** tvoje Project URL;
   - **Name:** `SUPABASE_PUBLISHABLE_KEY`, **Value:** tvůj publishable key.

## 6. Znovu sestav aplikaci

Nastavení se projeví až při dalším sestavení.
- Buď nahraj jakoukoli další aktualizaci (`git push`),
- nebo na GitHubu otevři **Actions**, pak **Deploy to GitHub Pages**, pak **Run workflow**.

Počkej na zelenou fajfku.

## 7. Vyzkoušej

1. Otevři aplikaci, pak **Profil**, pak sekci **Účet**.
2. Napiš svůj e-mail a klikni na **POSLAT KÓD**.
3. Kód z e-mailu napiš do aplikace a klikni na **PŘIHLÁSIT**.
4. Uvidíš „Přihlášen(a) jako …“. Po zavření a otevření aplikace zůstaneš přihlášený.

Kontrola v Supabase: **Authentication → Users**. Tam uvidíš svůj e-mail jako uživatele.

**Jaký e-mail použít:** ten, kterým jsi přihlášený do Supabase. Když ses přihlásil přes GitHub,
je to e-mail tvého GitHub účtu. Najdeš ho v Supabase vpravo nahoře (ikona účtu) nebo v
**Organization settings → Team**. Na jinou adresu kód zatím nepřijde a aplikace napíše
„Na tuhle adresu teď server e-mail neposílá…“. To je v pořádku, viz krok 8.

## 8. Později: přihlášení pro všechny (až bude doména)

Tohle **teď nedělej**. Přijde na řadu po koupi domény (viz [POSTUP.md](POSTUP.md), krok 3).

1. Založ si účet u služby na odesílání e-mailů, například **Resend** (má tarif zdarma).
2. V Resend přidej svou doménu a u registrátora domény vlož záznamy DNS, které Resend ukáže.
3. V Supabase otevři **Authentication → Emails → SMTP Settings**, zapni **Custom SMTP** a vyplň
   údaje z Resend. Odesílatel bude například `no-reply@tvoje-domena.cz`.
4. V **Authentication → Rate Limits** zvyš počet e-mailů za hodinu podle potřeby.
5. V **Authentication → URL Configuration** změň **Site URL** na novou adresu aplikace.

---

## Omezení Free plánu (vědět předem)

- **E-maily:** vestavěný odesílač Supabase posílá **jen členům týmu projektu** (tobě) a jen asi
  2 e-maily za hodinu. Na testování to stačí. Pro veřejnost je potřeba vlastní SMTP s doménou
  (krok 8).
- **Uspání:** projekt bez aktivity se po týdnu uspí. Probudíš ho v Supabase tlačítkem **Restore**.
  Až se bude prodávat, přejde se na placený plán Pro, který se neuspává.
- **Co je uložené:** jen e-mail a technické údaje o přihlášení. Žádná poloha, trasy ani statistiky.

## Když něco nejde

| Co vidíš | Co udělat |
|---|---|
| „Online účet zatím není dostupný“ i po nastavení | Zkontroluj přesné názvy proměnných v kroku 5 a že běh v Actions doběhl po jejich vytvoření. |
| E-mail přijde s odkazem, ne s kódem | Krok 2: šablona musí obsahovat `{{ .Token }}`, a to v obou šablonách. |
| „Příliš mnoho pokusů“ | Vestavěný odesílač pošle jen asi 2 e-maily za hodinu. Počkej a zkus to později. |
| „Na tuhle adresu teď server e-mail neposílá“ | Použij e-mail, kterým jsi přihlášený do Supabase (viz krok 7). |
| E-mail nepřišel | Podívej se do spamu. Zkontroluj, že projekt není uspaný. |
