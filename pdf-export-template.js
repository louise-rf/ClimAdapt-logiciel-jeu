(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function replaceEvery(text, search, replacement) {
    return String(text).split(search).join(replacement);
  }

  function getDirectChildElements(parent, tagName) {
    const normalizedTagName = String(tagName || "").toUpperCase();
    return Array.from(parent?.children || []).filter(
      (child) => child.tagName === normalizedTagName
    );
  }

  function clearElement(node) {
    while (node?.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function findPrimaryContentTbody(root) {
    return Array.from(root?.querySelectorAll("tbody") || []).find((tbody) =>
      Array.from(tbody.children || []).some(
        (row) =>
          row.tagName === "TR" &&
          String(row.textContent || "").includes("Comprendre : les définitions de l’adaptation")
      )
    );
  }

  function isPreferredBreakRow(row) {
    const text = String(row?.textContent || "").replace(/\s+/g, " ").trim();
    return (
      text.startsWith("2. Analyser :") ||
      text.startsWith("3. Agir :") ||
      text.startsWith("4. Vos choix :") ||
      text.startsWith("Axe 1 :") ||
      text.startsWith("Axe 2 :") ||
      text.startsWith("Axe 3 :") ||
      text.startsWith("Axe 4 :")
    );
  }

  function prepareExportVisuals(root, options) {
    Array.from(root?.querySelectorAll("img") || []).forEach((image) => {
      image.setAttribute("crossorigin", "anonymous");
      image.style.maxWidth = image.style.maxWidth || "100%";
      image.style.height = image.style.height || "auto";
    });

    Array.from(root?.querySelectorAll("td") || []).forEach((cell) => {
      const text = String(cell.textContent || "").trim();
      if (text === "💡") {
        cell.style.textAlign = "center";
        cell.style.fontFamily =
          '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",Tahoma,Geneva,sans-serif';
      }
    });
  }

  async function inlineExternalImages(root) {
    const images = Array.from(root?.querySelectorAll("img") || []);
    const tasks = images.map(async function (image) {
      const source = String(image.getAttribute("src") || image.src || "").trim();
      if (!source || !/^https?:\/\//i.test(source)) {
        return;
      }

      try {
        const response = await fetch(source, { mode: "cors", cache: "force-cache" });
        if (!response.ok) {
          return;
        }

        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) {
          image.setAttribute("src", dataUrl);
        }
      } catch (error) {
        console.warn("Impossible d'intégrer une image distante dans l'export PDF.", error);
      }
    });

    await Promise.all(tasks);
  }

  function waitForExportAssets(root, exportDocument) {
    const images = Array.from(root?.querySelectorAll("img") || []);
    const imagePromises = images.map((image) => {
      if (image.complete && image.naturalWidth > 0) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const done = function () {
          resolve();
        };

        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
        window.setTimeout(done, 4000);
      });
    });

    const fontsReady =
      exportDocument?.fonts && exportDocument.fonts.ready
        ? exportDocument.fonts.ready.catch(function () {})
        : Promise.resolve();

    return Promise.all([fontsReady, Promise.all(imagePromises)]).then(function () {});
  }

  function renderScoreHtml(scoreText) {
    return `<table border="0" cellpadding="0" cellspacing="0" style="margin-top:8px"><tbody><tr><td style="background-color:#ddf4dd;border-radius:10px;padding:10px 14px;font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.2;color:#0d1216">${scoreText || "&nbsp;"}</td></tr></tbody></table>`;
  }

  function renderAchievementText(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    return items
      .map((item) => String(item?.title || "").trim())
      .filter(Boolean)
      .map(escapeHtml)
      .join(", ");
  }

  function renderActionText(groups) {
    if (!Array.isArray(groups) || groups.length === 0) {
      return "";
    }

    return groups
      .flatMap((group) => (Array.isArray(group?.actions) ? group.actions : []))
      .map((action) => String(action || "").trim())
      .filter(Boolean)
      .map(escapeHtml)
      .join(", ");
  }

  function renderAchievementHtml(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    const chips = items
      .map((item) => ({
        badge: escapeHtml(String(item?.badge || "").trim()),
        title: escapeHtml(String(item?.title || "").trim()),
      }))
      .filter((item) => item.badge || item.title)
      .map(
        (item) =>
          `<span style="display:inline-block;background-color:#ddf4dd;border-radius:999px;padding:7px 12px;margin:8px 8px 0 0;font-size:14px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.3;color:#0d1216">${item.badge ? `${item.badge} ` : ""}${item.title}</span>`
      )
      .join("");

    return chips ? `<div style="margin-top:4px">${chips}</div>` : "";
  }

  function renderActionHtml(groups) {
    if (!Array.isArray(groups) || groups.length === 0) {
      return "";
    }

    const sections = groups
      .map((group) => {
        const category = escapeHtml(String(group?.category || "").trim());
        const actions = Array.isArray(group?.actions)
          ? group.actions
              .map((action) => escapeHtml(String(action || "").trim()))
              .filter(Boolean)
          : [];

        if (!category && !actions.length) {
          return "";
        }

        const actionItems = actions
          .map(
            (action) =>
              `<tr><td style="width:18px;vertical-align:top;font-size:16px;line-height:1.4;color:#0d1216">•</td><td style="font-size:14px;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.5;color:#0d1216">${action}</td></tr>`
          )
          .join("");

        return `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;margin-top:10px;background-color:#f6f7f8;border-radius:10px"><tbody><tr><td style="padding:10px 12px 8px;font-size:14px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.3;color:#0d1216">${category || "&nbsp;"}</td></tr><tr><td style="padding:0 12px 10px"><table border="0" cellpadding="0" cellspacing="0" style="width:100%"><tbody>${actionItems}</tbody></table></td></tr></tbody></table>`;
      })
      .join("");

    return sections ? `<div style="margin-top:2px">${sections}</div>` : "";
  }

  function buildClimAdaptExportHtml(payload) {
    const scoreText = escapeHtml(payload?.scoreText || "");
    const achievementsText = renderAchievementText(payload?.achievements || []);
    const actionsText = renderActionText(payload?.actionGroups || []);
    const scoreHtml = renderScoreHtml(scoreText);
    const achievementsHtml = renderAchievementHtml(payload?.achievements || []);
    const actionsHtml = renderActionHtml(payload?.actionGroups || []);
    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="preload" as="image" href="images/c86e1bd02866dc2abb45eba605306a0f.png"><link rel="preload" as="image" href="images/152b7731fe605e6f981b4b368190ab71.png"><link rel="preload" as="image" href="images/bbb6c7da7088c40139226704e546ff6c.png"><link rel="preload" as="image" href="images/a1f3f447961c6903f1f87104487678b0.png"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="format-detection" content="telephone=no, date=no, address=no, email=no"><meta name="x-apple-disable-message-reformatting"><meta name="keywords" content="DAHR_UmtG5M, BAFftZ2lh3s"><style>body{margin:0;padding:0}table{mso-table-lspace:0;mso-table-rspace:0}p,span,h1,h2,h3,h4,h5,h6{margin:0;padding:0}p{line-height:inherit}a[x-apple-data-detectors]{color:inherit!important;text-decoration:inherit!important}#MessageViewBody a{color:inherit;text-decoration:none}img+div{display:none}@media (max-width:599px){.ecw{width:100%!important;min-width:0!important}}</style><!--[if mso]><div>
                <noscript>
                  <xml>
                    <w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
                      <w:DontUseAdvancedTypographyReadingMail/>
                    </w:WordDocument>
                    <o:OfficeDocumentSettings>
                      <o:AllowPNG/>
                      <o:PixelsPerInch>96</o:PixelsPerInch>
                    </o:OfficeDocumentSettings>
                  </xml>
                </noscript></div><![endif]--><!--[if !mso]><!--><style>@media (max-width:1px){
.l0-c0,.l0-c1{display:block!important;width:100%!important}
.l0-s0{display:block!important;width:auto!important;height:16px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:100px){
.l1-c0,.l1-c1{display:block!important;width:100%!important}
.l1-s0{display:block!important;width:auto!important;height:3px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:450px){
.l2-c0,.l2-c1,.l2-c2,.l2-c3{display:block!important;width:100%!important}
.l2-s0,.l2-s1,.l2-s2{display:block!important;width:auto!important;height:16px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:100px){
.l3-c0,.l3-c1{display:block!important;width:100%!important}
.l3-s0{display:block!important;width:auto!important;height:3px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:100px){
.l4-c0,.l4-c1{display:block!important;width:100%!important}
.l4-s0{display:block!important;width:auto!important;height:3px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:1px){
.l5-c0,.l5-c1,.l5-c2,.l5-c3{display:block!important;width:100%!important}
.l5-s0,.l5-s1,.l5-s2{display:block!important;width:auto!important;height:0px;font-size:0}
}</style><!--<![endif]--><style>@media(max-width:550px){.ers-fs-200{font-size:18px!important}.ers-fs-213{font-size:18.7px!important}.ers-fs-227{font-size:19.4px!important}.ers-fs-320{font-size:24px!important}.ers-fs-547{font-size:35.4px!important}}</style></head><body style="width:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%;background-color:#f0f1f5;margin:0;padding:0"><table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5"><tbody><tr><td style="background-color:#f0f1f5"><!--[if mso]><center>
                    <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
                      <tbody>
                        <tr>
                          <td><![endif]--><table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" class="ecw" style="max-width:600px;min-height:600px;margin:0 auto;background-color:#ffffff;width:600px;min-width:600px"><tbody><tr><td style="vertical-align:top"></td></tr><tr><td style="vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" class="layout-0" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#99ff99"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:600px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="54.34%" class="l0-c0" style="width:54.34%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:15px 5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 0px 16px;line-height:0.88;mso-line-height-alt:16px"><span class="ers-fs-547" style="font-size:54.7px;white-space:pre-wrap"> </span><span class="ers-fs-547" style="font-size:54.7px;white-space:pre-wrap">Atelier                                       </span><br></td></tr><tr><td dir="ltr" class="ers-fs-547" style="font-size:54.7px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;line-height:0.88;mso-line-height-alt:54.7px"><span style="color:#212121;white-space:pre-wrap"> Clim</span><span style="white-space:pre-wrap">Adapt  </span><br></td></tr></tbody></table></td></tr></tbody></table></td><td width="0" class="l0-s0" style="width:0;box-sizing:border-box;font-size:0">&nbsp;</td><td width="45.66%" class="l0-c1" style="width:45.66%;box-sizing:border-box;vertical-align:bottom;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:274px"><tbody><tr><td style="width:100%"><img src="https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/c86e1bd02866dc2abb45eba605306a0f.png" width="274" height="178" style="display:block;width:274px;height:auto;max-width:100%"></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="vertical-align:top;padding:0px
           0px
           0px
           0px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"><tbody><tr><td style="padding:24px 0 24px 0;vertical-align:top"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">1.</span><span style="white-space:pre-wrap"> Comprendre : les définitions de l’adaptation</span><br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px"><span style="white-space:pre-wrap">L’adaptation est une démarche d’ajustement au climat actuel ou attendu ainsi qu’à ses effets. L’</span><span style="font-weight:700;white-space:pre-wrap">adaptation </span><span style="white-space:pre-wrap">agit donc sur les </span><span style="font-weight:700;white-space:pre-wrap">conséquences </span><span style="white-space:pre-wrap">du changement climatique, là où l’</span><span style="font-weight:700;white-space:pre-wrap">atténuation </span><span style="white-space:pre-wrap">agit sur ses </span><span style="font-weight:700;white-space:pre-wrap">effets</span><span style="white-space:pre-wrap">.</span><br></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" class="layout-1" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#ddf4dd;border-top-left-radius:10px;border-top-right-radius:10px;border-bottom-left-radius:10px;border-bottom-right-radius:10px"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:552px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="9.95%" class="l1-c0" style="width:9.95%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" class="ers-fs-320" style="font-size:32px;font-family:Tahoma, Geneva, sans-serif;white-space:pre-wrap;text-align:left;line-height:1.4;mso-line-height-alt:44.8px">💡<br></td></tr></tbody></table></td></tr></tbody></table></td><td width="3" class="l1-s0" style="width:3px;box-sizing:border-box;font-size:0">&nbsp;</td><td width="89.51%" class="l1-c1" style="width:89.51%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:10px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="color:#0d1216;font-size:13.3px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;line-height:22.4px;mso-line-height-alt:22.4px">L’atténuation et l’adaptation sont complémentaires, ce sont deux côtés d’une même pièce. Il ne faut pas les opposer mais bien les associer.<br></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px"><span style="white-space:pre-wrap">Ces conséquences se traduisent par deux grandes catégories de risques : les </span><span style="font-weight:700;white-space:pre-wrap">risques de transition</span><span style="white-space:pre-wrap"> (pertes financières et économiques liées aux transformations nécessaires) et les </span><span style="font-weight:700;white-space:pre-wrap">risques physiques</span><span style="white-space:pre-wrap"> (dommages directs causés par les aléas climatiques</span><br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px"><span style="white-space:pre-wrap">En France, l’adaptation est encadrée par la </span><span style="font-weight:700;white-space:pre-wrap">TRACC </span><span style="white-space:pre-wrap">et par le </span><span style="font-weight:700;white-space:pre-wrap">PNACC</span><span style="white-space:pre-wrap">. Les pressions réglementaires restent faibles en matière d’adaptation, les principales exigences provenant de la </span><span style="font-weight:700;white-space:pre-wrap">CSRD </span><span style="white-space:pre-wrap">et du </span><span style="font-weight:700;white-space:pre-wrap">devoir de vigilance</span><span style="white-space:pre-wrap">.</span><br></td></tr><tr><td style="padding:0px 24px 16px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:552px"><tbody><tr><td height="2" style="height:2px;border-radius:999px;line-height:2px;mso-line-height-rule:exactly;font-size:0;background-color:#99ff99">&nbsp;</td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">2.</span><span style="white-space:pre-wrap"> Analyser : identifier et prioriser les risques</span><br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px">D’après le GIEC, le calcul du risque repose sur le croisement de trois composantes :<br></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" class="layout-2" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:552px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="16.85%" class="l2-c0" style="width:16.85%;box-sizing:border-box;vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" class="ers-fs-227" style="font-size:22px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;line-height:1.4;mso-line-height-alt:31.8px"><span style="font-weight:700;white-space:pre-wrap">Risque</span><span style="white-space:pre-wrap">  = </span><br></td></tr></tbody></table></td></tr></tbody></table></td><td width="16" class="l2-s0" style="width:16px;box-sizing:border-box;font-size:0">&nbsp;</td><td width="17.93%" class="l2-c1" style="width:17.93%;box-sizing:border-box;vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;line-height:1.4;mso-line-height-alt:22.4px"><span class="ers-fs-227" style="font-size:22px;font-weight:700;white-space:pre-wrap">Aléa     </span><span class="ers-fs-200" style="font-size:20px;white-space:pre-wrap">x</span><br></td></tr></tbody></table></td></tr></tbody></table></td><td width="16" class="l2-s1" style="width:16px;box-sizing:border-box;font-size:0">&nbsp;</td><td width="27.90%" class="l2-c2" style="width:27.90%;box-sizing:border-box;vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;line-height:1.4;mso-line-height-alt:22.4px"><span class="ers-fs-227" style="font-size:22px;font-weight:700;white-space:pre-wrap">Exposition    </span><span class="ers-fs-200" style="font-size:20px;white-space:pre-wrap">x</span><br></td></tr></tbody></table></td></tr></tbody></table></td><td width="16" class="l2-s2" style="width:16px;box-sizing:border-box;font-size:0">&nbsp;</td><td width="28.62%" class="l2-c3" style="width:28.62%;box-sizing:border-box;vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" class="ers-fs-227" style="font-size:22px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;line-height:1.4;mso-line-height-alt:31.8px">Vulnérabilité<br></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px"><span style="white-space:pre-wrap">Un </span><span style="font-weight:700;white-space:pre-wrap">aléa</span><span style="white-space:pre-wrap"> se définit comme un événement susceptible de se produire et pouvant entraîner des dommages. L’</span><span style="font-weight:700;white-space:pre-wrap">exposition</span><span style="white-space:pre-wrap"> correspond à l’ensemble des populations, milieux et activités susceptibles d’être affectés par ces aléas. Enfin, la </span><span style="font-weight:700;white-space:pre-wrap">vulnérabilité</span><span style="white-space:pre-wrap"> représente le degré auquel un système peut être affecté négativement par les effets de ces aléas.</span><br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px">L’adaptation consiste principalement à agir sur les composantes “exposition” et “vulnérabilité” du risque. La composante “aléa” relève davantage de l’atténuation<br></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" class="layout-3" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#ddf4dd;border-top-left-radius:10px;border-top-right-radius:10px;border-bottom-left-radius:10px;border-bottom-right-radius:10px"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:552px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="9.95%" class="l3-c0" style="width:9.95%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" class="ers-fs-320" style="font-size:32px;font-family:Tahoma, Geneva, sans-serif;white-space:pre-wrap;text-align:left;line-height:1.4;mso-line-height-alt:44.8px">💡<br></td></tr></tbody></table></td></tr></tbody></table></td><td width="3" class="l3-s0" style="width:3px;box-sizing:border-box;font-size:0">&nbsp;</td><td width="89.51%" class="l3-c1" style="width:89.51%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:10px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="color:#0d1216;font-size:13.3px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;line-height:22.4px;mso-line-height-alt:22.4px">En s’appuyant sur les trois composantes du risque, il est possible de calculer une valeur à risque climatique en croisant la valeur exposée, le coefficient de perte et le niveau de vulnérabilité.<br></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px"><span style="white-space:pre-wrap">Le calcul du risque à un instant T n’est pas suffisant : les risques climatiques </span><span style="font-weight:700;white-space:pre-wrap">évoluent </span><span style="white-space:pre-wrap">dans le </span><span style="font-weight:700;white-space:pre-wrap">temps </span><span style="white-space:pre-wrap">et peuvent être très différents à l’horizon 2030, 2050 ou 2100. L’analyse du risque ne doit donc pas être considérée comme une image figée du futur, mais être réévaluée à différents horizons temporels.</span><br></td></tr><tr><td style="padding:0px 24px 16px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:552px"><tbody><tr><td height="2" style="height:2px;border-radius:999px;line-height:2px;mso-line-height-rule:exactly;font-size:0;background-color:#99ff99">&nbsp;</td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">3.</span><span style="white-space:pre-wrap"> Agir : construire une stratégie d’adaptation</span><br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px"><span style="white-space:pre-wrap">Pour sélectionner des actions d’adaptation, deux grands principes sont à suivre : </span><span style="font-weight:700;white-space:pre-wrap">éviter la maladaptation</span><span style="white-space:pre-wrap"> et </span><span style="font-weight:700;white-space:pre-wrap">rechercher les co-bénéfices</span><span style="white-space:pre-wrap">. Une fois cette sélection réalisée, les actions peuvent être réparties en cinq catégories selon les ressources mobilisées : </span><span style="font-weight:700;white-space:pre-wrap">techniques, solutions fondées sur la nature, organisationnelles, financières et humaines</span><span style="white-space:pre-wrap">.</span><br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px">Enfin, pour combiner ces différentes actions de manière cohérente, plusieurs bonnes pratiques sont recommandées : <br></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-spacing:0px;table-layout:fixed;direction:ltr"><tbody><tr><td width="99.63768115942028%" style="width:99.63768115942028%;box-sizing:border-box;font-size:0">&nbsp;</td></tr><tr><td rowspan="1" colspan="1" width="100%" height="22" style="padding:10px;vertical-align:middle;box-sizing:border-box;width:100%;height:22px;background-color:#f6f7f8;border-top:2px solid #ffffff;border-bottom:2px solid #ffffff;border-left:2px solid #ffffff;border-right:2px solid #ffffff"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">Axe 1 : Anticiper et diagnostiquer les risques climatiques<br></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Le calcul des risques est complet et priorise les risques entre eux, cette analyse est renouvelée pour s’adapter aux incertitudes des données climatiques.<br></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">La chaîne de valeur de l’entreprise est analysée en entier avec une identification des parties prenantes<br></td></tr></tbody></table></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-spacing:0px;table-layout:fixed;direction:ltr"><tbody><tr><td width="99.63768115942028%" style="width:99.63768115942028%;box-sizing:border-box;font-size:0">&nbsp;</td></tr><tr><td rowspan="1" colspan="1" width="100%" height="22" style="padding:10px;vertical-align:middle;box-sizing:border-box;width:100%;height:22px;background-color:#f6f7f8;border-top:2px solid #ffffff;border-bottom:2px solid #ffffff;border-left:2px solid #ffffff;border-right:2px solid #ffffff"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;line-height:1.4;mso-line-height-alt:22.4px"><span style="font-weight:700;white-space:pre-wrap">Axe 2 :</span><span style="white-space:pre-wrap"> </span><span style="font-weight:700;white-space:pre-wrap">Construire une stratégie d’adaptation de long terme</span><br></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">La stratégie d’adaptation est continue et flexible, des révisions fréquentes sont prévues<br></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Plusieurs temporalités sont visibles dans la stratégie<br></td></tr></tbody></table></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-spacing:0px;table-layout:fixed;direction:ltr"><tbody><tr><td width="99.63768115942028%" style="width:99.63768115942028%;box-sizing:border-box;font-size:0">&nbsp;</td></tr><tr><td rowspan="1" colspan="1" width="100%" height="22" style="padding:10px;vertical-align:middle;box-sizing:border-box;width:100%;height:22px;background-color:#f6f7f8;border-top:2px solid #ffffff;border-bottom:2px solid #ffffff;border-left:2px solid #ffffff;border-right:2px solid #ffffff"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">Axe 3 : Déployer un plan d’actions opérationnel<br></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Les préjudices importants ainsi que la maladaptation sont évités, la recherche est tournée vers les co-bénéfices<br></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Une collaboration avec les acteurs du territoires et du secteurs est mise en place<br></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">La stratégie ne se concentre pas sur une unique catégorie d’actions<br></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Les solutions fondées sur la nature sont privilégiées face aux solutions “grises” <br></td></tr></tbody></table></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-spacing:0px;table-layout:fixed;direction:ltr"><tbody><tr><td width="99.63768115942028%" style="width:99.63768115942028%;box-sizing:border-box;font-size:0">&nbsp;</td></tr><tr><td rowspan="1" colspan="1" width="100%" height="22" style="padding:10px;vertical-align:middle;box-sizing:border-box;width:100%;height:22px;background-color:#f6f7f8;border-top:2px solid #ffffff;border-bottom:2px solid #ffffff;border-left:2px solid #ffffff;border-right:2px solid #ffffff"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">Axe 4 : Mettre en place un suivi et une gouvernance de l’adaptation <br></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Les différentes strates de l’entreprise concernées sont formées sur les sujets d’adaptation et sont tenues au courant de la stratégie interne, les compétences sont actualisées si besoin<br></td></tr></tbody></table></td></tr><tr><td dir="ltr" style="text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">La prise de décision est soutenue par des outils et des indicateurs avec une intégration des parties prenantes dans la discussion<br></td></tr></tbody></table></td></tr><tr><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" class="layout-4" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#ddf4dd;border-top-left-radius:10px;border-top-right-radius:10px;border-bottom-left-radius:10px;border-bottom-right-radius:10px"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:552px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="9.95%" class="l4-c0" style="width:9.95%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" class="ers-fs-320" style="font-size:32px;font-family:Tahoma, Geneva, sans-serif;white-space:pre-wrap;text-align:left;line-height:1.4;mso-line-height-alt:44.8px">💡<br></td></tr></tbody></table></td></tr></tbody></table></td><td width="3" class="l4-s0" style="width:3px;box-sizing:border-box;font-size:0">&nbsp;</td><td width="89.51%" class="l4-c1" style="width:89.51%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:10px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="color:#0d1216;font-size:13.3px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;line-height:22.4px;mso-line-height-alt:22.4px">Ces bonnes pratiques s’appuient sur les recommandations actuelles des instances gouvernementales et scientifiques françaises. Elles sont amenées à évoluer et à s’affiner au fil des années, à mesure que les connaissances et les retours d’expérience progressent.<br></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="padding:0px 24px 16px"><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:552px"><tbody><tr><td height="2" style="height:2px;border-radius:999px;line-height:2px;mso-line-height-rule:exactly;font-size:0;background-color:#99ff99">&nbsp;</td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">4.</span><span style="white-space:pre-wrap"> Vos choix : une stratégie robuste</span><br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px">Votre score :  ${scoreText}<br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:22.4px">Vos succès débloqués :   ${achievementsText}<br></td></tr><tr><td dir="ltr" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 24px;line-height:1.4;mso-line-height-alt:22.4px">Vos actions sélectionnées :     ${actionsText}<br></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td height="100%" style="height:100%;font-size:0;line-height:0" aria-hidden="true">&nbsp;</td></tr><tr><td style="vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" class="layout-5" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#e7f5e7"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:600px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="13.83%" class="l5-c0" style="width:13.83%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="39" style="width:39px"><tbody><tr><td><![endif]--><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:39px"><tbody><tr><td style="width:100%"><img src="https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/152b7731fe605e6f981b4b368190ab71.png" width="39" height="49" style="display:block;width:39px;height:auto;max-width:100%"></td></tr></tbody></table><!--[if mso]></td></tr></tbody></table><![endif]--></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td><td width="0" class="l5-s0" style="width:0;box-sizing:border-box;font-size:0">&nbsp;</td><td width="13.33%" class="l5-c1" style="width:13.33%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="39" style="width:39px"><tbody><tr><td><![endif]--><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:39px"><tbody><tr><td style="width:100%"><img src="https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/bbb6c7da7088c40139226704e546ff6c.png" width="39" height="55" style="display:block;width:39px;height:auto;max-width:100%"></td></tr></tbody></table><!--[if mso]></td></tr></tbody></table><![endif]--></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td><td width="0" class="l5-s1" style="width:0;box-sizing:border-box;font-size:0">&nbsp;</td><td width="43.58%" class="l5-c2" style="width:43.58%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="148" style="width:148px"><tbody><tr><td><![endif]--><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:148px"><tbody><tr><td style="width:100%"><img src="https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/a1f3f447961c6903f1f87104487678b0.png" width="148" height="58" style="display:block;width:148px;height:auto;max-width:100%"></td></tr></tbody></table><!--[if mso]></td></tr></tbody></table><![endif]--></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td><td width="0" class="l5-s2" style="width:0;box-sizing:border-box;font-size:0">&nbsp;</td><td width="29.25%" class="l5-c3" style="width:29.25%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:10.7px;letter-spacing:-0.0025em;font-family:Tahoma, Geneva, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 0px 16px;line-height:8px;mso-line-height-alt:10.7px;text-decoration:none">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:10.7px;letter-spacing:-0.0025em;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:right;padding:0px 0px 16px;line-height:8px;mso-line-height-alt:10.7px">© 2026 Akteo - Tous droits réservés  <br></td></tr><tr><td dir="ltr" style="font-size:10.7px;letter-spacing:-0.0025em;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:right;padding:0px 0px 16px;line-height:8px;mso-line-height-alt:10.7px"><a href="http://akteo.ovh" target="_blank" rel="noopener noreferrer" style="color:#000000;text-decoration:none">akteo.ovh</a> | <a href="mailto:conseil@akteo.fr" target="_blank" rel="noopener noreferrer" style="color:#000000;text-decoration:none">conseil@akteo.fr</a>  <br></td></tr><tr><td dir="ltr" style="font-size:16px;letter-spacing:-0.0025em;font-family:Tahoma, Geneva, sans-serif;white-space:pre-wrap;text-align:left;line-height:0.5;mso-line-height-alt:16px;text-decoration:none">&nbsp;</td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table>
<script>(function(){function c(){var b=Array.prototype.slice.call(document.images||[]);if(!b.length){return Promise.resolve()}return Promise.all(b.map(function(d){if(d.complete){return Promise.resolve()}return new Promise(function(e){var f=function(){e()};d.addEventListener("load",f,{once:true});d.addEventListener("error",f,{once:true});window.setTimeout(f,2500)})}))}function a(){window.setTimeout(function(){window.focus();window.print()},200)}window.addEventListener("load",function(){c().then(function(){if(document.fonts&&document.fonts.ready){document.fonts.ready.then(a);return}a()})})})();</script></body></html>`;

    const printStyles = `<style>@page{size:A4;margin:12mm}html,body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}img{max-width:100%;height:auto}.export-avoid-break{break-inside:avoid;page-break-inside:avoid}.export-break-before{break-before:page;page-break-before:always}@media print{html,body{background-color:#f0f1f5!important}body,table,tbody,tr,td,span,p,a{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}.export-avoid-break{break-inside:avoid;page-break-inside:avoid}.export-break-before{break-before:page;page-break-before:always}}</style>`;
    const legacyPrintScript = `<script>(function(){function c(){var b=Array.prototype.slice.call(document.images||[]);if(!b.length){return Promise.resolve()}return Promise.all(b.map(function(d){if(d.complete){return Promise.resolve()}return new Promise(function(e){var f=function(){e()};d.addEventListener("load",f,{once:true});d.addEventListener("error",f,{once:true});window.setTimeout(f,2500)})}))}function a(){window.setTimeout(function(){window.focus();window.print()},200)}window.addEventListener("load",function(){c().then(function(){if(document.fonts&&document.fonts.ready){document.fonts.ready.then(a);return}a()})})})();</script>`;
    const improvedPrintScript = `<script>(function(){function f(b){return new Promise(function(c,d){var e=new FileReader();e.onload=function(){c(String(e.result||""))};e.onerror=d;e.readAsDataURL(b)})}function g(){var b=Array.prototype.slice.call(document.images||[]);return Promise.all(b.map(function(c){var d=String(c.getAttribute("src")||c.src||"").trim();if(!/^https?:\\/\\//i.test(d)){return Promise.resolve()}return fetch(d,{mode:"cors",cache:"force-cache"}).then(function(e){if(!e.ok){return null}return e.blob()}).then(function(e){if(!e){return null}return f(e)}).then(function(e){if(e){c.src=e}}).catch(function(){return null})}))}function h(){var b=Array.prototype.slice.call(document.images||[]);if(!b.length){return Promise.resolve()}return Promise.all(b.map(function(c){if(c.complete&&c.naturalWidth>0){return Promise.resolve()}return new Promise(function(d){var e=function(){d()};c.addEventListener("load",e,{once:true});c.addEventListener("error",e,{once:true});window.setTimeout(e,4000)})}))}function i(){window.setTimeout(function(){window.focus();window.print()},500)}window.addEventListener("load",function(){g().then(h).then(function(){if(document.fonts&&document.fonts.ready){return document.fonts.ready.catch(function(){})}}).then(i)})})();</script>`;

    return replaceEvery(
      replaceEvery(
        replaceEvery(
          replaceEvery(
            replaceEvery(
              replaceEvery(
                replaceEvery(
                  replaceEvery(
                    replaceEvery(
                      replaceEvery(
                        html,
                        `</head>`,
                        `${printStyles}</head>`
                      ),
                      legacyPrintScript,
                      improvedPrintScript
                    ),
                    `class="layout-1"`,
                    `class="layout-1 export-avoid-break"`
                  ),
                  `class="layout-2"`,
                  `class="layout-2 export-avoid-break"`
                ),
                `class="layout-3"`,
                `class="layout-3 export-avoid-break"`
              ),
              `class="layout-4"`,
              `class="layout-4 export-avoid-break"`
            ),
            `class="layout-5"`,
            `class="layout-5 export-avoid-break"`
          ),
          `<tr><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">3.</span>`,
          `<tr class="export-break-before"><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">3.</span>`
        ),
        `.ers-fs-200{font-size:18px!important}`,
        `.ers-fs-200{font-size:15px!important}`
      ),
      `.ers-fs-227{font-size:19.4px!important}`,
      `.ers-fs-227{font-size:17px!important}`
    )
      .replace(
        `<tr><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">4.</span>`,
        `<tr class="export-avoid-break"><td dir="ltr" class="ers-fs-213" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 24px 16px;line-height:1.4;mso-line-height-alt:29.8px"><span style="background-color:#99ff99;white-space:pre-wrap">4.</span>`
      )
      .replace(
        `font-size:22px`,
        `font-size:19px`
      )
      .replace(
        `font-size:20px`,
        `font-size:17px`
      )
      .replace(
        `Votre score :  ${scoreText}<br>`,
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Votre score :  </td></tr></tbody></table>${scoreHtml}`
      )
      .replace(
        `Vos succès débloqués :   ${achievementsText}<br>`,
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Vos succès débloqués :   </td></tr></tbody></table>${achievementsHtml}`
      )
      .replace(
        `Vos actions sélectionnées :     ${actionsText}<br>`,
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:16px;color:#000;display:inline-block">•</span></td><td style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;vertical-align:top">Vos actions sélectionnées :     </td></tr></tbody></table>${actionsHtml}`
      );
  }

  function createClimAdaptExportDocument(html, options) {
    const cleanedHtml = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(
        "</head>",
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet"></head>'
      );

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-20000px";
    iframe.style.top = "0";
    iframe.style.width = "620px";
    iframe.style.height = "1600px";
    iframe.style.pointerEvents = "none";
    iframe.style.opacity = "0";
    iframe.style.zIndex = "-1";
    iframe.style.border = "0";
    iframe.srcdoc = cleanedHtml;

    const api = {
      container: iframe,
      pagesRoot: null,
      ready: null,
      cleanup: function () {
        iframe.remove();
      },
    };

    api.ready = new Promise(function (resolve, reject) {
      iframe.addEventListener(
        "load",
        async function () {
          try {
            const exportDocument = iframe.contentDocument;
            const sourceTable = exportDocument?.querySelector("table.ecw");
            const sourceBody = sourceTable?.querySelector("tbody");
            const sourceRows = getDirectChildElements(sourceBody, "tr");
            const heroRow = sourceRows[1] || null;
            const contentRow = sourceRows[2] || null;
            const footerRow = sourceRows[sourceRows.length - 1] || null;
            const contentTbody = findPrimaryContentTbody(contentRow);
            const contentRows = getDirectChildElements(contentTbody, "tr");
            const pagesRoot = exportDocument.createElement("div");

            pagesRoot.className = "climadapt-export-pages";
            pagesRoot.style.width = "600px";
            pagesRoot.style.margin = "0 auto";
            pagesRoot.style.backgroundColor = "#f0f1f5";

            function createPageShell(includeHero) {
              const page = exportDocument.createElement("div");
              page.className = "climadapt-export-page";
              page.style.width = "600px";
              page.style.boxSizing = "border-box";
              page.style.padding = "0";
              page.style.margin = "0 auto";
              page.style.backgroundColor = "#f0f1f5";

              const shellTable = sourceTable.cloneNode(false);
              const shellBody = exportDocument.createElement("tbody");
              shellTable.appendChild(shellBody);

              if (includeHero && heroRow) {
                shellBody.appendChild(heroRow.cloneNode(true));
              }

              if (contentRow) {
                const pageContentRow = contentRow.cloneNode(true);
                const pageContentTbody = findPrimaryContentTbody(pageContentRow);
                clearElement(pageContentTbody);
                shellBody.appendChild(pageContentRow);

                if (footerRow) {
                  shellBody.appendChild(footerRow.cloneNode(true));
                }

                page.appendChild(shellTable);

                return {
                  page,
                  contentTbody: pageContentTbody,
                };
              }

              page.appendChild(shellTable);
              return {
                page,
                contentTbody: null,
              };
            }

            const maxPageHeight = Number(options?.pageHeightPx) || 940;
            const pageDescriptors = [];
            let startIndex = 0;

            while (startIndex < contentRows.length) {
              const descriptor = createPageShell(pageDescriptors.length === 0);
              pagesRoot.appendChild(descriptor.page);

              let cursor = startIndex;
              let lastPreferredBreakCount = -1;

              while (cursor < contentRows.length && descriptor.contentTbody) {
                descriptor.contentTbody.appendChild(contentRows[cursor].cloneNode(true));

                const currentRowCount = descriptor.contentTbody.children.length;
                if (isPreferredBreakRow(contentRows[cursor])) {
                  lastPreferredBreakCount = currentRowCount;
                }

                if (descriptor.page.offsetHeight > maxPageHeight && currentRowCount > 1) {
                  const keepCount =
                    lastPreferredBreakCount > 0 && lastPreferredBreakCount < currentRowCount
                      ? lastPreferredBreakCount
                      : currentRowCount - 1;

                  while (descriptor.contentTbody.children.length > keepCount) {
                    descriptor.contentTbody.removeChild(descriptor.contentTbody.lastChild);
                  }

                  cursor = startIndex + keepCount;
                  break;
                }

                cursor += 1;
              }

              pageDescriptors.push(descriptor);
              startIndex = cursor;
            }

            clearElement(exportDocument.body);
            exportDocument.body.style.margin = "0";
            exportDocument.body.style.padding = "0";
            exportDocument.body.style.backgroundColor = "#f0f1f5";
            exportDocument.body.appendChild(pagesRoot);

            prepareExportVisuals(exportDocument.body, options);
            await inlineExternalImages(exportDocument.body);
            await waitForExportAssets(exportDocument.body, exportDocument);

            api.pagesRoot = pagesRoot;
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        { once: true }
      );
    });

    return api;
  }

  function openClimAdaptPrintWindow(html) {
    const printWindow = window.open("", "climadapt-export", "width=1200,height=900");
    if (!printWindow) {
      return null;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return printWindow;
  }

  window.buildClimAdaptExportHtml = buildClimAdaptExportHtml;
  window.createClimAdaptExportDocument = createClimAdaptExportDocument;
  window.openClimAdaptPrintWindow = openClimAdaptPrintWindow;
})();
