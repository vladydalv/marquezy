=== Marquezy – Marquee Block & Announcement Bar ===
Contributors: wpspacenerd
Donate link: https://www.spacenerd.space/
Tags: marquee, announcement bar, ticker, scrolling text, shortcode
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Announcement bar, Marquee block and shortcode builder: 1–3 seamless scrolling rows — straight, tilted or crossed.

== Description ==

Marquezy adds seamless scrolling text to your site — as an announcement bar below the header, as a block, or as a shortcode for page builders. The loop is pure CSS: no jumps, no rewinds, and nothing runs while it is out of view.

= Announcement bar =

Configured on **Settings → Marquezy**, with a live preview.

* **Phrases** — a numbered list; each phrase has its own field with bold, italic and links (with a search of your pages). Enter adds the next phrase.
* **Where to show** — entire site, only on selected pages, everywhere except selected pages, or only where you place it yourself. Conditions: specific pages and posts, post types, categories/tags/terms and special pages (front page, blog, archives, search, 404).
* **Sticky modes** — scrolls with the content, always visible, or "smart" (follows a header that hides on scroll).
* **Placement** — right after the header: in block themes on the server (no layout shift), in classic themes after the detected header or a CSS selector of your choice.
* Close button (remembered per content — a new announcement shows again), optional pause button, hide on mobile with a custom breakpoint and a separate mobile font size.

= Marquee block =

* Own rows (1–3) or the announcement bar.
* **Straight, tilted or crossed** — tilt up to 10°; two crossed rows with an adjustable crossing point.
* Direction per row — by default left / right / left.
* Every phrase is a regular paragraph; colors, font size and padding use the editor's own controls; optional drop shadow per row.
* Animated preview right in the editor.

= Shortcode builder =

For page builders (Elementor, Divi, WPBakery…) and the Classic editor. Build a marquee with the same options as the block and a live preview, save it and paste `[marquezy id="3"]` anywhere. `[marquezy]` without an id shows the announcement bar.

= Light and accessible =

* Plain CSS animation driven by a tiny script; no jQuery, no external libraries.
* Pauses on hover, on keyboard focus and when scrolled out of view; respects "reduce motion".
* Optional pause button (WCAG 2.2.2); duplicated copies are hidden from screen readers and the keyboard.

= Multilingual =

Phrases per language for WPML, Polylang and TranslatePress, with a fallback to the first language that has phrases.

== Installation ==

1. In your dashboard, go to Plugins → Add New, search for "Marquezy" and click Install, then Activate.
2. Go to **Settings → Marquezy**: add phrases, choose where the bar appears and adjust its look.
3. For more marquees add the **Marquee** block, or build one on the **Shortcodes** tab.

== Frequently Asked Questions ==

= Does it work with page builders? =

Yes. Build a marquee on Settings → Marquezy → Shortcodes and paste its shortcode into any text or shortcode widget. Rows added to the page later (builder previews, popups, AJAX content) start automatically.

= Can I show the announcement bar only on some pages? =

Yes — choose "Only on selected pages" or "Everywhere except selected pages" and pick pages, post types, terms or special pages. With "Only where the Marquee block is placed" nothing is added automatically; use the block (source: announcement bar) or the `[marquezy]` shortcode.

= Can I change the starting colors of new rows? =

Yes, with the `marquezy_row_presets` filter — an array of `[ 'bg' => …, 'text' => … ]` for rows 1–3.

= Will removing the plugin leave anything in my database? =

No. Uninstalling deletes the plugin's options (bar settings and saved shortcodes). Blocks and shortcodes in your posts stay as they are.

== Screenshots ==

1. Settings → Marquee: phrases with bold, italic and links, and a live preview of the announcement bar.
2. Where to show: the entire site, only on selected pages, everywhere except them, or only where you place the block.
3. The Marquee block: 1–3 rows of your own, each phrase a regular paragraph with the editor's own colour and typography controls.
4. Shortcode builder: the same options as the block, with a tilted two-row layout and a live preview.
5. Crossed layout: two rows crossing, with an adjustable crossing point.

== Changelog ==

= 1.0.0 =
* Initial release.
