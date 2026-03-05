// Shared email templates for Triple Cities Tech
// Uses light backgrounds for maximum compatibility across email clients
// (Outlook dark mode, Gmail, Apple Mail, etc.)

interface WelcomeEmailParams {
  contactName: string | null
  portalUrl: string
  password: string | null
}

export function getWelcomeEmailHtml({ contactName, portalUrl, password }: WelcomeEmailParams): string {
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    body { margin: 0; padding: 0; width: 100%; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    u + .body a { color: inherit; text-decoration: none; font-size: inherit; font-weight: inherit; line-height: inherit; }
  </style>
</head>
<body class="body" style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Email container -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);">

          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 48px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; line-height: 1.3;">
                Welcome to Your<br>Triple Cities Tech Project Portal
              </h1>
            </td>
          </tr>

          <!-- Accent bar -->
          <tr>
            <td style="background-color: #06b6d4; height: 4px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px; background-color: #ffffff;">

              <!-- Greeting -->
              <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1e293b;">
                Hello${contactName ? ` ${contactName}` : ''},
              </p>

              <!-- Message -->
              <p style="margin: 0 0 32px; font-size: 15px; line-height: 1.7; color: #475569;">
                Welcome to your Triple Cities Tech project portal! You can now track the progress of your projects in real-time, view project phases, and stay updated on important milestones.
              </p>

              <!-- Credentials box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="background-color: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px;">

                    <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #0891b2;">
                      Your Portal Access Credentials
                    </p>

                    <!-- Portal Link -->
                    <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                      Portal Link:
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
                          <a href="${portalUrl}" style="font-family: 'Courier New', monospace; font-size: 14px; color: #0891b2; text-decoration: none; word-break: break-all;">${portalUrl}</a>
                        </td>
                      </tr>
                    </table>

                    ${password ? `
                    <!-- Password -->
                    <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                      Password:
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
                          <span style="font-family: 'Courier New', monospace; font-size: 15px; color: #1e293b; font-weight: 600;">${password}</span>
                        </td>
                      </tr>
                    </table>
                    ` : `
                    <p style="margin: 0; font-size: 14px; color: #64748b; font-style: italic;">
                      Use your existing password to log in.
                    </p>
                    `}

                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${portalUrl}" style="height:54px;v-text-anchor:middle;width:280px;" arcsize="22%" fillcolor="#0891b2" stroke="f">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:18px;font-weight:bold;">Access Your Portal &rarr;</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${portalUrl}" style="display: inline-block; background-color: #0891b2; color: #ffffff; padding: 16px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; line-height: 1;">
                      Access Your Portal &rarr;
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Features -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #f8fafc; border-radius: 10px; padding: 20px 24px;">
                    <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #1e293b;">
                      What you can do in the portal:
                    </p>
                    <p style="margin: 0 0 6px; font-size: 14px; color: #475569;">&#10003;&nbsp; View real-time project progress</p>
                    <p style="margin: 0 0 6px; font-size: 14px; color: #475569;">&#10003;&nbsp; Track completed tasks and milestones</p>
                    <p style="margin: 0 0 6px; font-size: 14px; color: #475569;">&#10003;&nbsp; See project phase status and timelines</p>
                    <p style="margin: 0; font-size: 14px; color: #475569;">&#10003;&nbsp; Access important project notes</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 28px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 700; color: #1e293b;">
                Need Help or Have Questions?
              </p>
              <p style="margin: 0 0 4px; font-size: 14px; color: #475569;">
                Call: <a href="tel:+16073417500" style="color: #0891b2; text-decoration: none; font-weight: 600;">(607) 341-7500</a>
              </p>
              <p style="margin: 0 0 20px; font-size: 14px; color: #475569;">
                Email: <a href="mailto:support@triplecitiestech.com" style="color: #0891b2; text-decoration: none; font-weight: 600;">support@triplecitiestech.com</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                &copy; ${year} Triple Cities Tech. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`
}
