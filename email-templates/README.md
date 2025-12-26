# Triple Cities Tech - Autotask Email Templates

Professional HTML email templates matching your website's dark, modern aesthetic.

## Templates Included

### 1. `autotask-template-dark.html`
**Full-featured template** with gradient effects and the tariff notice example.
- Dark theme matching website
- Cyan accent colors (#06b6d4)
- Gradient header (may not work in all email clients)
- Highlighted info boxes
- Professional CTA button
- Complete footer with contact info

### 2. `autotask-template-simple.html`
**Simplified customizable template** - easier to edit for any message.
- Same dark theme
- Solid colors (better email client compatibility)
- Placeholder sections for easy customization
- Comments showing what to change

## Color Palette

Matching your website:
- **Primary Background**: `#0f172a` (dark slate)
- **Secondary Background**: `#1e293b` (lighter slate)
- **Accent/Brand Color**: `#06b6d4` (cyan)
- **Text Primary**: `#e2e8f0` (light gray)
- **Text Secondary**: `#cbd5e1` (medium gray)
- **Text Muted**: `#94a3b8` (dark gray)

## How to Use in Autotask

### Option 1: Copy Entire Template
1. Open the HTML file in a text editor
2. Select all (Ctrl+A / Cmd+A)
3. Copy (Ctrl+C / Cmd+C)
4. Paste into Autotask contact action template HTML editor

### Option 2: Customize First
1. Open `autotask-template-simple.html`
2. Find sections marked with `[BRACKETS]`
3. Replace with your content:
   - `[SUBJECT LINE HERE]` - Your email subject/title
   - `[Your main message content goes here...]` - Your message
   - `[YOUR LINK HERE]` - Button URL
   - `[BUTTON TEXT]` - Button label
4. Copy and paste into Autotask

## Autotask Variables

You can use Autotask variables anywhere in the template. Common ones:

- `[Contact: First Name]` - Contact's first name
- `[Contact: Last Name]` - Contact's last name
- `[Contact: Email]` - Contact's email
- `[Company: Name]` - Company name
- `[Ticket: Number]` - Ticket number (if applicable)

Example:
```html
<p style="font-size: 16px; color: #e2e8f0;">
  Hi [Contact: First Name],
</p>
```

## Customization Tips

### Change Button Link
Find this section:
```html
<a href="[YOUR LINK HERE]" style="...">
```
Replace `[YOUR LINK HERE]` with:
- Email: `mailto:sales@triplecitiestech.com`
- Phone: `tel:+16073417500`
- Website: `https://www.triplecitiestech.com/contact`
- Portal: `https://triplecitiestech.us.cloudradial.com/login`

### Add/Remove Highlighted Boxes
Copy this block to add more highlighted sections:
```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: rgba(6, 182, 212, 0.1); border-left: 4px solid #06b6d4; border-radius: 8px; margin: 24px 0;">
  <tr>
    <td style="padding: 20px;">
      <p style="font-size: 15px; line-height: 1.7; color: #e2e8f0; margin: 0;">
        <strong style="color: #06b6d4;">Your Title:</strong><br>
        <span style="color: #cbd5e1;">Your content...</span>
      </p>
    </td>
  </tr>
</table>
```

### Change Button Color
Default button: `background-color: #06b6d4` (cyan)

Alternative colors:
- Green: `#10b981`
- Orange: `#f97316`
- Purple: `#8b5cf6`
- Red: `#ef4444`

### Add Multiple Buttons
Copy the entire button table block and paste it where you want another button.

## Email Client Compatibility

These templates are tested and work in:
- ✅ Outlook (Desktop & Web)
- ✅ Gmail
- ✅ Apple Mail
- ✅ Yahoo Mail
- ✅ Thunderbird
- ✅ Mobile email clients (iOS, Android)

**Note:** Some email clients don't support CSS gradients. That's why we include both a gradient version (nicer but may show solid colors in some clients) and a simple version (solid colors, works everywhere).

## Template Structure

```
┌─────────────────────────────┐
│  Header (Cyan with Logo)   │  ← Company name and tagline
├─────────────────────────────┤
│  Subject Bar (Dark)         │  ← Email subject/title
├─────────────────────────────┤
│                             │
│  Body Content (Slate)       │  ← Main message
│  - Greeting                 │
│  - Message                  │
│  - Highlighted boxes        │
│  - CTA Button               │
│  - Signature                │
│                             │
├─────────────────────────────┤
│  Footer (Dark)              │  ← Contact info & legal
└─────────────────────────────┘
```

## Best Practices

1. **Keep it short** - Most people skim emails
2. **One clear CTA** - Don't overwhelm with multiple actions
3. **Test before sending** - Send yourself a test email first
4. **Mobile-friendly** - These templates are responsive (max-width: 600px)
5. **Contrast** - White/light text on dark backgrounds is readable
6. **Accessibility** - Use adequate font sizes (min 14px for body text)

## Support

Questions about these templates? Contact the Triple Cities Tech team or check the main website design files.

## Version History

- **v1.0** (2025-01-XX) - Initial templates matching website redesign
  - Dark theme with cyan accents
  - Two versions: gradient and simple
  - Mobile responsive
  - Autotask variable support
