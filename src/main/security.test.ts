import { describe, expect, it } from 'vitest'
import { csvField } from './db/exportCsv'
import { isFragranticaUrl } from './fragrantica/fragranticaParser'
import { isAllowedImageUrl, isFragranticaHost, isStoredImageName } from './security'

describe('Fragrantica hosts', () => {
  it('accepts the real sites and their subdomains', () => {
    for (const h of ['fragrantica.com', 'www.fragrantica.com', 'www.fragrantica.es', 'fimgs.fragrantica.com.br', 'FRAGRANTICA.COM.']) expect(isFragranticaHost(h)).toBe(true)
  })
  it('refuses look-alikes', () => {
    for (const h of ['fragrantica.evil.com', 'www.fragrantica.com.evil.net', 'evilfragrantica.com', 'fragrantica.com.evil.com', 'fragrantica', 'localhost', '127.0.0.1']) expect(isFragranticaHost(h)).toBe(false)
  })
  it('only accepts https fragrance pages without credentials', () => {
    expect(isFragranticaUrl('https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html')).toBe(true)
    expect(isFragranticaUrl('https://fragrantica.evil.com/perfume/Dior/Sauvage-31861.html')).toBe(false)
    expect(isFragranticaUrl('https://user:pw@www.fragrantica.com/perfume/Dior/Sauvage-31861.html')).toBe(false)
    expect(isFragranticaUrl('file:///C:/Windows/win.ini')).toBe(false)
    expect(isFragranticaUrl('https://www.fragrantica.com@evil.com/perfume/x.html')).toBe(false)
  })
})

describe('picture addresses', () => {
  it('allows https pictures from the picture host and Fragrantica', () => {
    expect(isAllowedImageUrl('https://fimgs.net/mdimg/perfume/375x500.9828.jpg')).toBe(true)
    expect(isAllowedImageUrl('https://www.fragrantica.com/mdimg/x.jpg')).toBe(true)
  })
  it('refuses everything that could reach the user’s own machine or network', () => {
    for (const u of ['http://fimgs.net/a.jpg', 'file:///C:/Users/x/secret.png', 'https://127.0.0.1/a.png', 'https://localhost/a.png', 'https://169.254.169.254/latest', 'https://fimgs.net.evil.com/a.jpg', 'https://fimgs.net:8443/a.jpg', 'https://a:b@fimgs.net/a.jpg', 'data:image/png;base64,AAAA', 'not a url'])
      expect(isAllowedImageUrl(u), u).toBe(false)
  })
  it('recognises the stored file names and nothing else', () => {
    expect(isStoredImageName('0042f4d7c1fc00c1.png')).toBe(true)
    for (const n of ['../a.png', '..\a.png', 'a.png', '0042f4d7c1fc00c1.png/../x', '0042F4D7C1FC00C1.png', 'C:\\x.png', '']) expect(isStoredImageName(n), n).toBe(false)
  })
})

describe('CSV cells', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
  })
  it('keeps formula-looking text from running in a spreadsheet, but not numbers', () => {
    expect(csvField('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csvField('+1+1')).toBe("'+1+1")
    expect(csvField('-2+3')).toBe("'-2+3")
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvField(-5)).toBe('-5')
    expect(csvField(null)).toBe('')
    expect(csvField('café ✓ 😀')).toBe('café ✓ 😀')
  })
})
