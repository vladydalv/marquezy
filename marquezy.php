<?php
/**
 * Plugin Name:       Marquezy – Marquee Block & Announcement Bar
 * Description:       Announcement bar below the header, a Marquee block and a shortcode builder: 1–3 scrolling rows, straight, tilted or crossed.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Vlad Zelinskyi
 * Author URI:        https://www.spacenerd.space/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       marquezy
 */

defined( 'ABSPATH' ) || exit;

define( 'MARQUEZY_VERSION', '1.0.0' );
define( 'MARQUEZY_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'MARQUEZY_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'MARQUEZY_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

/* ══════════════════════════════════════════════════
 * 1. Default options
 * ══════════════════════════════════════════════════ */
function marquezy_default_options(): array {
	return [
		'enabled'            => 1,
		'phrases'            => [],   // [ 'en' => [ '<b>html</b>', '...' ], 'uk' => [ ... ] ]
		'bg_color'           => '#F06A8F', // Rose & Plum (see marquezy_row_presets)
		'text_color'         => '#FFFFFF',
		'link_color'         => '#5B2A4E',
		'font_size'          => 14,
		'font_size_mobile'   => 12,
		'speed'              => 60,
		'gap'                => 30,
		'height'             => 40,
		'padding_v'          => 0,
		'z_index'            => 999,
		'hide_mobile'        => 0,
		'mobile_breakpoint'  => 768,
		'sticky_mode'        => 'scroll', // scroll | always | smart
		'header_selector'    => '',       // empty = auto-detect
		'close_button'       => 0,
		'pause_button'       => 0,
		'close_persist'      => 'session', // session | day | week
		'separator'          => 'none',    // none | bar | dot | star | diamond | asterisk | dash
		'separator_color'    => '',        // empty = inherit text color
		'separator_size'     => 14,
		'display_mode'       => 'all',     // all | include | exclude | manual (block only)
		'rule_pages'         => [],        // post IDs
		'rule_post_types'    => [],        // post type slugs
		'rule_terms'         => [],        // term IDs
		'rule_special'       => [],        // front | blog | archive | search | 404
	];
}

/* ══════════════════════════════════════════════════
 * 2. Install (uninstall: see uninstall.php)
 * ══════════════════════════════════════════════════ */
register_activation_hook( __FILE__, function () {
	if ( false === get_option( 'marquezy_options' ) ) {
		add_option( 'marquezy_options', marquezy_default_options() );
	}
} );


/* ══════════════════════════════════════════════════
 * 3. Helpers
 * ══════════════════════════════════════════════════ */

/**
 * Options merged with defaults (unknown keys dropped, sane minimums enforced).
 */
function marquezy_get_options(): array {
	$raw = get_option( 'marquezy_options', [] );
	$raw = is_array( $raw ) ? $raw : [];
	$o   = wp_parse_args( $raw, marquezy_default_options() );

	if ( ! is_array( $o['phrases'] ) ) {
		$o['phrases'] = [];
	}

	$o = array_intersect_key( $o, marquezy_default_options() );

	/* Sane minimums */
	$o['height']           = max( 20, (int) $o['height'] );
	$o['font_size']        = max( 8, (int) $o['font_size'] );
	$o['font_size_mobile'] = max( 8, (int) $o['font_size_mobile'] );
	$o['speed']            = max( 10, (int) $o['speed'] );
	$o['z_index']          = max( 1, (int) $o['z_index'] );

	return $o;
}

/**
 * Detect active multilingual plugin and return list of languages.
 * Returns [ ['code'=>'en','key'=>'en','name'=>'English','flag'=>'','active'=>true], ... ]
 * `key` is the sanitized code used to store phrases.
 */
function marquezy_get_languages(): array {
	$languages = [];

	// --- WPML ---
	if ( function_exists( 'icl_get_languages' ) ) {
		$wpml_langs = icl_get_languages( 'skip_missing=0&orderby=code' );
		if ( is_array( $wpml_langs ) ) {
			foreach ( $wpml_langs as $lang ) {
				$languages[] = [
					'code'   => $lang['language_code'],
					'name'   => $lang['translated_name'] ?: $lang['native_name'],
					'flag'   => $lang['country_flag_url'] ?? '',
					'active' => ! empty( $lang['active'] ),
				];
			}
		}
	} elseif ( function_exists( 'pll_languages_list' ) ) {
		// --- Polylang ---
		$codes   = pll_languages_list( [ 'fields' => 'slug' ] );
		$names   = pll_languages_list( [ 'fields' => 'name' ] );
		$flags   = pll_languages_list( [ 'fields' => 'flag_url' ] );
		$current = function_exists( 'pll_current_language' ) ? pll_current_language() : '';
		foreach ( $codes as $i => $code ) {
			$languages[] = [
				'code'   => $code,
				'name'   => $names[ $i ] ?? $code,
				'flag'   => $flags[ $i ] ?? '',
				'active' => $code === $current,
			];
		}
	} elseif ( class_exists( 'TRP_Translate_Press' ) ) {
		// --- TranslatePress ---
		$trp       = \TRP_Translate_Press::get_trp_instance();
		$settings  = $trp->get_component( 'settings' );
		$trp_opts  = $settings->get_settings();
		$all_langs = $trp_opts['translation-languages'] ?? [];
		$default   = $trp_opts['default-language'] ?? '';
		$published = $trp_opts['publish-languages'] ?? $all_langs;

		$lang_names = [];
		if ( class_exists( 'TRP_Languages' ) ) {
			$trp_languages = new \TRP_Languages();
			$lang_names    = $trp_languages->get_language_names( $published );
		}
		$current_lang = ! empty( $GLOBALS['TRP_LANGUAGE'] ) ? $GLOBALS['TRP_LANGUAGE'] : $default;

		foreach ( $published as $code ) {
			$languages[] = [
				'code'   => $code,
				'name'   => $lang_names[ $code ] ?? $code,
				'flag'   => '',
				'active' => $code === $current_lang,
			];
		}
	}

	// --- No multilingual plugin: site locale only ---
	if ( ! $languages ) {
		$code        = substr( get_locale(), 0, 2 );
		$languages[] = [
			'code'   => $code,
			'name'   => $code,
			'flag'   => '',
			'active' => true,
		];
	}

	foreach ( $languages as &$lang ) {
		$lang['key'] = sanitize_key( $lang['code'] );
	}
	unset( $lang );

	return $languages;
}

/**
 * Get the current front-end language code.
 */
function marquezy_get_current_language(): string {
	// WPML
	if ( defined( 'ICL_LANGUAGE_CODE' ) ) {
		return ICL_LANGUAGE_CODE;
	}
	// Polylang
	if ( function_exists( 'pll_current_language' ) ) {
		return pll_current_language() ?: substr( get_locale(), 0, 2 );
	}
	// TranslatePress
	if ( ! empty( $GLOBALS['TRP_LANGUAGE'] ) ) {
		return $GLOBALS['TRP_LANGUAGE'];
	}
	return substr( get_locale(), 0, 2 );
}

/**
 * True when an HTML fragment contains visible text.
 */
function marquezy_has_visible_text( string $html ): bool {
	$text = wp_strip_all_tags( $html );
	$text = str_replace( [ '&nbsp;', "\xC2\xA0" ], '', $text );
	return '' !== trim( $text );
}

/**
 * Remove block artifacts (<div>, <p>, <br>) and collapse whitespace — one phrase = one line.
 */
function marquezy_flatten_html( string $html ): string {
	$html = preg_replace( '#</?(div|p)\b[^>]*>#i', '', $html );
	$html = preg_replace( '#<br\s*/?\s*>#i', ' ', $html );
	$html = preg_replace( '/\s+/', ' ', $html );
	return trim( $html );
}

/**
 * Frames (phrases) for the current language. Memoized per request.
 * Falls back to the first language that has phrases.
 *
 * @return string[] Sanitized HTML of each frame.
 */
function marquezy_get_frames(): array {
	static $frames = null;
	if ( null !== $frames ) {
		return $frames;
	}

	$phrases = marquezy_get_options()['phrases'];
	$lang    = marquezy_get_current_language();
	$list    = [];

	foreach ( [ sanitize_key( $lang ), sanitize_key( substr( $lang, 0, 2 ) ) ] as $key ) {
		if ( ! empty( $phrases[ $key ] ) ) {
			$list = $phrases[ $key ];
			break;
		}
	}
	if ( ! $list ) {
		foreach ( $phrases as $candidate ) {
			if ( ! empty( $candidate ) ) {
				$list = $candidate;
				break;
			}
		}
	}

	$frames = [];
	foreach ( (array) $list as $html ) {
		$html = marquezy_flatten_html( (string) $html );
		if ( marquezy_has_visible_text( $html ) ) {
			$frames[] = wp_kses_post( $html );
		}
	}

	return $frames;
}

/**
 * Short hash of the current language's phrases. A visitor who closed the bar
 * sees it again as soon as the content changes.
 */
function marquezy_content_hash(): string {
	return substr( md5( implode( "\n", marquezy_get_frames() ) ), 0, 10 );
}

/**
 * Separator markup placed after every frame (the last one closes the loop seamlessly).
 */
function marquezy_get_separator_html( string $sep ): string {
	$icons = [
		'star'     => '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>',
		'diamond'  => '<svg xmlns="http://www.w3.org/2000/svg" width="0.8em" height="0.8em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><polygon points="12,2 22,12 12,22 2,12"/></svg>',
		'asterisk' => '<svg xmlns="http://www.w3.org/2000/svg" width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2Z"/></svg>',
	];
	// Shapes instead of text glyphs (•, |, —): glyphs sit on the font baseline and look off-center.
	$icons['dot']  = '<svg xmlns="http://www.w3.org/2000/svg" width="0.4em" height="0.4em" viewBox="0 0 10 10" fill="currentColor" focusable="false"><circle cx="5" cy="5" r="5"/></svg>';
	$icons['bar']  = '<svg xmlns="http://www.w3.org/2000/svg" width="0.12em" height="1em" viewBox="0 0 2 16" fill="currentColor" focusable="false"><rect width="2" height="16" rx="1"/></svg>';
	$icons['dash'] = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="0.12em" viewBox="0 0 16 2" fill="currentColor" focusable="false"><rect width="16" height="2" rx="1"/></svg>';

	if ( isset( $icons[ $sep ] ) ) {
		$inner = $icons[ $sep ];
	} else {
		return '<span class="marquezy-sep marquezy-sep--none" aria-hidden="true"></span>';
	}

	return '<span class="marquezy-sep" aria-hidden="true">' . $inner . '</span>';
}

/**
 * Special views a display rule can target.
 */
function marquezy_special_keys(): array {
	return [ 'front', 'blog', 'archive', 'search', '404' ];
}

/**
 * Accept hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb[a]() and hsl[a]() colors.
 */
function marquezy_sanitize_color( $value ): string {
	$value = trim( (string) $value );
	if ( preg_match( '/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $value ) ) {
		return $value;
	}
	// Named colors (red, transparent …).
	if ( preg_match( '/^[a-z]{3,30}$/i', $value ) ) {
		return $value;
	}
	// Preset reference: var(--wp--preset--color--slug).
	if ( preg_match( '/^var\(--wp--preset--color--[a-z0-9-]+\)$/i', $value ) ) {
		return $value;
	}
	// Color functions (rgb/hsl/hwb/lab/lch/oklab/oklch/color/color-mix), one level of nesting,
	// no characters that could break out of a style attribute.
	$arg = '[a-z0-9.%\s,\/+#-]*';
	if ( preg_match( '/^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(' . $arg . '(?:[a-z-]*\(' . $arg . '\)' . $arg . ')*\)$/i', $value ) ) {
		return $value;
	}
	return '';
}

/**
 * Add our own (already sanitized) declarations to a block wrapper's style attribute.
 * get_block_wrapper_attributes() runs styles through safecss_filter_attr(), which (WP 7+)
 * drops values with functions like rgba() — shadow and alpha colors would disappear.
 */
function marquezy_wrapper_with_style( string $wrapper, string $style ): string {
	if ( '' === $style ) {
		return $wrapper;
	}
	if ( preg_match( '/\sstyle="/', ' ' . $wrapper ) ) {
		return preg_replace( '/(^|\s)style="/', '$1style="' . esc_attr( $style ), $wrapper, 1 );
	}
	return $wrapper . ' style="' . esc_attr( $style ) . '"';
}

/* ══════════════════════════════════════════════════
 * 4. Setting registration (options.php + REST /wp/v2/settings)
 * ══════════════════════════════════════════════════ */
function marquezy_options_schema(): array {
	$int    = [ 'type' => 'integer' ];
	$string = [ 'type' => 'string' ];
	$ids    = [ 'type' => 'array', 'items' => [ 'type' => 'integer' ] ];

	return [
		'type'                 => 'object',
		'additionalProperties' => false,
		'properties'           => [
			'enabled'            => $int,
			'phrases'            => [
				'type'                 => 'object',
				'additionalProperties' => [ 'type' => 'array', 'items' => $string ],
			],
			'bg_color'           => $string,
			'text_color'         => $string,
			'link_color'         => $string,
			'font_size'          => $int,
			'font_size_mobile'   => $int,
			'speed'              => $int,
			'gap'                => $int,
			'height'             => $int,
			'padding_v'          => $int,
			'z_index'            => $int,
			'hide_mobile'        => $int,
			'mobile_breakpoint'  => $int,
			'sticky_mode'        => [ 'type' => 'string', 'enum' => [ 'scroll', 'always', 'smart' ] ],
			'header_selector'    => $string,
			'close_button'       => $int,
			'pause_button'       => $int,
			'close_persist'      => [ 'type' => 'string', 'enum' => [ 'session', 'day', 'week' ] ],
			'separator'          => [ 'type' => 'string', 'enum' => [ 'none', 'bar', 'dot', 'star', 'diamond', 'asterisk', 'dash' ] ],
			'separator_color'    => $string,
			'separator_size'     => $int,
			'display_mode'       => [ 'type' => 'string', 'enum' => [ 'all', 'include', 'exclude', 'manual' ] ],
			'rule_pages'         => $ids,
			'rule_post_types'    => [ 'type' => 'array', 'items' => $string ],
			'rule_terms'         => $ids,
			'rule_special'       => [ 'type' => 'array', 'items' => [ 'type' => 'string', 'enum' => marquezy_special_keys() ] ],
		],
	];
}

/* Registered on init so the REST settings endpoint sees it (admin_init doesn't run for REST). */
add_action( 'init', function () {
	register_setting( 'marquezy_settings_group', 'marquezy_options', [
		'type'              => 'object',
		'sanitize_callback' => 'marquezy_sanitize_options',
		'default'           => marquezy_default_options(),
		'show_in_rest'      => [ 'schema' => marquezy_options_schema() ],
	] );
} );

/* ══════════════════════════════════════════════════
 * 5. Sanitize
 * ══════════════════════════════════════════════════ */
function marquezy_sanitize_options( $input ): array {
	$input = is_array( $input ) ? $input : [];
	$d     = marquezy_default_options();
	$c     = [];

	$int = static function ( string $key, int $min, int $max ) use ( $input, $d ): int {
		$value = isset( $input[ $key ] ) && is_numeric( $input[ $key ] ) ? (int) $input[ $key ] : (int) $d[ $key ];
		return max( $min, min( $max, $value ) );
	};
	$ids = static function ( string $key ) use ( $input ): array {
		$list = isset( $input[ $key ] ) && is_array( $input[ $key ] ) ? $input[ $key ] : [];
		return array_values( array_unique( array_filter( array_map( 'absint', $list ) ) ) );
	};
	$enum = static function ( string $key, array $allowed ) use ( $input, $d ): string {
		$value = (string) ( $input[ $key ] ?? '' );
		return in_array( $value, $allowed, true ) ? $value : $d[ $key ];
	};

	$c['enabled'] = empty( $input['enabled'] ) ? 0 : 1;

	// Phrases: [ lang => [ html, ... ] ]
	$c['phrases'] = [];
	if ( isset( $input['phrases'] ) && is_array( $input['phrases'] ) ) {
		foreach ( $input['phrases'] as $lang => $list ) {
			$lang = sanitize_key( $lang );
			if ( '' === $lang || ! is_array( $list ) ) continue;
			$clean = [];
			foreach ( $list as $html ) {
				$html = marquezy_flatten_html( (string) $html );
				if ( marquezy_has_visible_text( $html ) ) {
					$clean[] = wp_kses_post( $html );
				}
			}
			if ( $clean ) {
				$c['phrases'][ $lang ] = $clean;
			}
		}
	}

	$c['bg_color']          = marquezy_sanitize_color( $input['bg_color'] ?? '' ) ?: $d['bg_color'];
	$c['text_color']        = marquezy_sanitize_color( $input['text_color'] ?? '' ) ?: $d['text_color'];
	$c['link_color']        = marquezy_sanitize_color( $input['link_color'] ?? '' ) ?: $d['link_color'];
	$c['font_size']         = $int( 'font_size', 8, 72 );
	$c['font_size_mobile']  = $int( 'font_size_mobile', 8, 72 );
	$c['speed']             = $int( 'speed', 10, 300 );
	$c['gap']               = $int( 'gap', 0, 500 );
	$c['height']            = $int( 'height', 20, 200 );
	$c['padding_v']         = $int( 'padding_v', 0, 60 );
	$c['z_index']           = $int( 'z_index', 1, 2147483647 );
	$c['hide_mobile']       = empty( $input['hide_mobile'] ) ? 0 : 1;
	$c['mobile_breakpoint'] = $int( 'mobile_breakpoint', 320, 1920 );
	$c['sticky_mode']       = $enum( 'sticky_mode', [ 'scroll', 'always', 'smart' ] );
	$c['header_selector']   = trim( str_replace( [ '<', '>', '{', '}', ';' ], '', sanitize_text_field( $input['header_selector'] ?? '' ) ) );
	$c['close_button']      = empty( $input['close_button'] ) ? 0 : 1;
	$c['pause_button']      = empty( $input['pause_button'] ) ? 0 : 1;
	$c['close_persist']     = $enum( 'close_persist', [ 'session', 'day', 'week' ] );
	$c['separator']         = $enum( 'separator', [ 'none', 'bar', 'dot', 'star', 'diamond', 'asterisk', 'dash' ] );
	$c['separator_color']   = marquezy_sanitize_color( $input['separator_color'] ?? '' );
	$c['separator_size']    = $int( 'separator_size', 8, 48 );

	$c['display_mode']    = in_array( $input['display_mode'] ?? '', [ 'all', 'include', 'exclude', 'manual' ], true ) ? $input['display_mode'] : 'all';
	$c['rule_pages']      = $ids( 'rule_pages' );
	$c['rule_terms']      = $ids( 'rule_terms' );
	$c['rule_post_types'] = isset( $input['rule_post_types'] ) && is_array( $input['rule_post_types'] )
		? array_values( array_unique( array_filter( array_map( 'sanitize_key', $input['rule_post_types'] ) ) ) )
		: [];
	$c['rule_special']    = isset( $input['rule_special'] ) && is_array( $input['rule_special'] )
		? array_values( array_intersect( marquezy_special_keys(), $input['rule_special'] ) )
		: [];

	return $c;
}

/* ══════════════════════════════════════════════════
 * 6. Admin: menu, page, assets
 * The page is a React app (wp.element + wp.components, no build step).
 * Phrases are edited in an isolated block editor (marquezy/phrase block).
 * ══════════════════════════════════════════════════ */
add_action( 'admin_menu', function () {
	add_options_page(
		__( 'Marquezy Settings', 'marquezy' ),
		__( 'Marquezy', 'marquezy' ),
		'manage_options',
		'marquezy',
		'marquezy_render_settings_page'
	);
} );

function marquezy_render_settings_page(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	echo '<div class="wrap marquezy-admin-wrap"><div id="marquezy-admin-root"></div></div>';
}

/**
 * Title + type label of selected rule items, for the pickers on the settings page.
 */
function marquezy_post_item( WP_Post $post ): array {
	$type = get_post_type_object( $post->post_type );
	return [
		'id'    => $post->ID,
		'title' => '' !== $post->post_title ? $post->post_title : __( '(no title)', 'marquezy' ),
		'meta'  => $type ? $type->labels->singular_name : $post->post_type,
	];
}

function marquezy_term_item( WP_Term $term ): array {
	$tax = get_taxonomy( $term->taxonomy );
	return [
		'id'    => $term->term_id,
		'title' => $term->name,
		'meta'  => $tax ? $tax->labels->singular_name : $term->taxonomy,
	];
}

/**
 * Theme + default palettes in the multi-origin format ColorPalette accepts.
 */
function marquezy_get_color_palettes(): array {
	$palette  = function_exists( 'wp_get_global_settings' ) ? (array) wp_get_global_settings( [ 'color', 'palette' ] ) : [];
	$origins  = [
		'theme'   => __( 'Theme', 'marquezy' ),
		'custom'  => __( 'Custom', 'marquezy' ),
		'default' => __( 'Default', 'marquezy' ),
	];
	$show_def = function_exists( 'wp_get_global_settings' ) ? wp_get_global_settings( [ 'color', 'defaultPalette' ] ) : true;
	$out      = [];

	// slug => value, to resolve var(--wp--preset--color--slug) references between palettes.
	$by_slug = [];
	foreach ( $palette as $items ) {
		foreach ( (array) $items as $item ) {
			if ( ! empty( $item['slug'] ) && ! empty( $item['color'] ) ) {
				$by_slug[ $item['slug'] ] = (string) $item['color'];
			}
		}
	}
	$resolve = static function ( string $color ) use ( $by_slug ): string {
		for ( $i = 0; $i < 5 && preg_match( '/^var\(--wp--preset--color--([a-z0-9-]+)\)$/i', $color, $m ); $i++ ) {
			$color = $by_slug[ $m[1] ] ?? '';
		}
		// Theme-specific variables (e.g. var(--ast-global-color-2)) are not defined on this screen:
		// a swatch would be empty and the value could not be previewed or saved — leave them out.
		return 0 === stripos( $color, 'var(' ) ? '' : marquezy_sanitize_color( $color );
	};

	foreach ( $origins as $origin => $label ) {
		if ( 'default' === $origin && false === $show_def && ! empty( $out ) ) continue;
		if ( empty( $palette[ $origin ] ) || ! is_array( $palette[ $origin ] ) ) continue;
		$colors = [];
		foreach ( $palette[ $origin ] as $item ) {
			$color = $resolve( (string) ( $item['color'] ?? '' ) );
			if ( '' === $color ) continue;
			$colors[] = [
				'name'  => $item['name'] ?? $color,
				'slug'  => $item['slug'] ?? '',
				'color' => $color,
			];
		}
		if ( $colors ) {
			$out[] = [ 'name' => $label, 'colors' => $colors ];
		}
	}

	return $out;
}

function marquezy_get_admin_data(): array {
	$o = marquezy_get_options();

	$post_types = [];
	foreach ( get_post_types( [ 'public' => true ], 'objects' ) as $slug => $pt ) {
		if ( 'attachment' === $slug ) {
			continue; // media files have no front-end pages worth targeting
		}
		$post_types[] = [ 'slug' => $slug, 'label' => $pt->labels->name, 'singular' => $pt->labels->singular_name ];
	}
	$taxonomies = [];
	foreach ( get_taxonomies( [ 'public' => true ], 'objects' ) as $slug => $tax ) {
		$taxonomies[ $slug ] = $tax->labels->singular_name;
	}

	$page_items = [];
	if ( $o['rule_pages'] ) {
		$posts = get_posts( [
			'post_type'      => array_keys( get_post_types( [ 'public' => true ] ) ), // 'any' skips exclude_from_search types
			'post_status'    => 'any',
			'post__in'       => $o['rule_pages'],
			'posts_per_page' => count( $o['rule_pages'] ),
			'orderby'        => 'post__in',
			'lang'           => '', // Polylang: all languages
		] );
		foreach ( $posts as $post ) {
			$page_items[] = marquezy_post_item( $post );
		}
	}
	$term_items = [];
	if ( $o['rule_terms'] ) {
		$terms = get_terms( [ 'include' => $o['rule_terms'], 'hide_empty' => false, 'taxonomy' => array_keys( $taxonomies ), 'lang' => '' ] );
		if ( ! is_wp_error( $terms ) ) {
			foreach ( $terms as $term ) {
				$term_items[] = marquezy_term_item( $term );
			}
		}
	}

	return [
		'options'    => $o,
		'defaults'   => marquezy_default_options(),
		'languages'  => marquezy_get_languages(),
		'postTypes'  => $post_types,
		'taxonomies' => $taxonomies,
		'palettes'   => marquezy_get_color_palettes(),
		'selected'   => [ 'pages' => $page_items, 'terms' => $term_items ],
		'shortcodes'           => marquezy_get_shortcodes(),
		'shortcodeNextId'      => (int) get_option( 'marquezy_shortcodes_next_id', 1 ),
		'shortcodeDefaults'    => marquezy_shortcode_defaults(),
		'shortcodeRowDefaults' => marquezy_shortcode_row_defaults(),
		'rowPresets'           => marquezy_row_presets(),
		'blockEditorUrl' => admin_url( 'post-new.php?post_type=page' ),
		'version'    => MARQUEZY_VERSION,
	];
}

add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( 'settings_page_marquezy' !== $hook ) {
		return;
	}

	wp_enqueue_script(
		'marquezy-admin',
		MARQUEZY_PLUGIN_URL . 'assets/js/admin.js',
		[
			'wp-api-fetch', 'wp-block-editor', 'wp-blocks', 'wp-components', 'wp-core-data', 'wp-data',
			'wp-dom-ready', 'wp-element', 'wp-format-library', 'wp-html-entities', 'wp-i18n', 'wp-keyboard-shortcuts', 'wp-rich-text', 'wp-url',
			'marquezy', // front-end loop for the shortcode live preview
		],
		MARQUEZY_VERSION,
		true
	);
	wp_add_inline_script( 'marquezy-admin', 'window.marquezyAdminData = ' . wp_json_encode( marquezy_get_admin_data() ) . ';', 'before' );
	wp_set_script_translations( 'marquezy-admin', 'marquezy' );

	wp_enqueue_style(
		'marquezy-admin',
		MARQUEZY_PLUGIN_URL . 'assets/css/admin.css',
		[ 'wp-components', 'wp-block-editor', 'wp-format-library', 'marquezy' ],
		MARQUEZY_VERSION
	);
} );

/* ══════════════════════════════════════════════════
 * 9. Frontend: visibility check
 * ══════════════════════════════════════════════════ */
function marquezy_should_display(): bool {
	static $result = null;
	if ( null !== $result ) {
		return $result;
	}
	$result = marquezy_compute_should_display();
	return $result;
}

function marquezy_compute_should_display(): bool {
	if ( is_admin() ) {
		return false;
	}

	$o = marquezy_get_options();

	if ( empty( $o['enabled'] ) || ! marquezy_get_frames() ) {
		return false;
	}

	switch ( $o['display_mode'] ) {
		case 'manual':
			return false; // only where the Marquee block is placed
		case 'include':
			return marquezy_rules_match( $o );
		case 'exclude':
			return ! marquezy_rules_match( $o );
		default:
			return true;
	}
}

/**
 * Does the current request match any of the display rules?
 */
function marquezy_rules_match( array $o ): bool {
	$queried_id = get_queried_object_id();

	// Specific pages / posts (the posts page counts too)
	$pages = array_map( 'intval', (array) $o['rule_pages'] );
	if ( $pages && ( is_singular() || ( is_home() && ! is_front_page() ) ) && in_array( $queried_id, $pages, true ) ) {
		return true;
	}

	// Post types: single views and archives (the blog index is the archive of "post")
	$types = (array) $o['rule_post_types'];
	if ( $types ) {
		if ( is_singular( $types ) || is_post_type_archive( $types ) ) {
			return true;
		}
		if ( in_array( 'post', $types, true ) && is_home() ) {
			return true;
		}
	}

	// Terms: term archives and singular posts that have the term
	$terms = array_map( 'intval', (array) $o['rule_terms'] );
	if ( $terms ) {
		if ( is_tax() || is_category() || is_tag() ) {
			$queried = get_queried_object();
			if ( $queried && isset( $queried->term_id ) && in_array( (int) $queried->term_id, $terms, true ) ) {
				return true;
			}
		}
		if ( is_singular() ) {
			foreach ( get_object_taxonomies( get_post_type( $queried_id ) ) as $tax ) {
				if ( has_term( $terms, $tax, $queried_id ) ) {
					return true;
				}
			}
		}
	}

	// Special views
	$checks = [
		'front'   => 'is_front_page',
		'blog'    => 'is_home',
		'archive' => 'is_archive',
		'search'  => 'is_search',
		'404'     => 'is_404',
	];
	foreach ( (array) $o['rule_special'] as $key ) {
		if ( isset( $checks[ $key ] ) && call_user_func( $checks[ $key ] ) ) {
			return true;
		}
	}

	return false;
}

/* ══════════════════════════════════════════════════
 * 10. Frontend: enqueue & render
 * ══════════════════════════════════════════════════ */
add_action( 'wp_enqueue_scripts', function () {
	if ( ! marquezy_should_display() ) {
		return;
	}

	$o  = marquezy_get_options();
	$bp = (int) $o['mobile_breakpoint'] ?: 768;

	wp_enqueue_style( 'marquezy' );

	// Media queries can't read custom properties, so the breakpoint is printed here.
	wp_add_inline_style(
		'marquezy',
		sprintf(
			'@media (max-width:%1$dpx){.marquezy-bar{font-size:var(--marquezy-fs-m)}.marquezy-bar--hide-mobile{display:none!important}}',
			$bp
		)
	);

	wp_enqueue_script( 'marquezy' );

	wp_localize_script( 'marquezy', 'marquezyConfig', [
		'stickyMode'     => $o['sticky_mode'],
		'headerSelector' => $o['header_selector'],
		'closePersist'   => $o['close_persist'],
		'contentHash'    => marquezy_content_hash(),
	] );
} );

/**
 * Build the marquee markup.
 *
 * @param string $position 'header' = placed by the server after the header template part,
 *                         'body' = top of <body>, 'footer' = theme without wp_body_open().
 */
function marquezy_get_marquee_html( string $position ): string {
	$o = marquezy_get_options();

	$vars = [
		'--marquezy-bg'       => $o['bg_color'],
		'--marquezy-color'    => $o['text_color'],
		'--marquezy-link'     => $o['link_color'],
		'--marquezy-fs'       => (int) $o['font_size'] . 'px',
		'--marquezy-fs-m'     => (int) $o['font_size_mobile'] . 'px',
		'--marquezy-h'        => (int) $o['height'] . 'px',
		'--marquezy-pv'       => (int) $o['padding_v'] . 'px',
		'--marquezy-z'        => (int) $o['z_index'],
		'--marquezy-gap'      => (int) $o['gap'] . 'px',
		'--marquezy-sep-size' => (int) $o['separator_size'] . 'px',
	];
	if ( ! empty( $o['separator_color'] ) ) {
		$vars['--marquezy-sep-color'] = $o['separator_color'];
	}
	$style = '';
	foreach ( $vars as $prop => $value ) {
		$style .= $prop . ':' . $value . ';';
	}

	$classes = [ 'marquezy-bar', 'marquezy-loop', 'marquezy-hover-pause', 'marquezy-bar--' . $o['sticky_mode'] ];
	if ( $o['hide_mobile'] ) {
		$classes[] = 'marquezy-bar--hide-mobile';
	}
	$controls = '';
	if ( $o['pause_button'] ) {
		$controls .= '<button type="button" class="marquezy-control marquezy-pause" aria-pressed="false" aria-label="' . esc_attr__( 'Pause announcements', 'marquezy' ) . '">'
			. '<svg class="marquezy-icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
			. '<svg class="marquezy-icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l10.4-6.5a1 1 0 0 0 0-1.74L9.5 4.63A1 1 0 0 0 8 5.5z"/></svg>'
			. '</button>';
	}
	if ( $o['close_button'] ) {
		$controls .= '<button type="button" class="marquezy-control marquezy-close" aria-label="' . esc_attr__( 'Close announcements', 'marquezy' ) . '">'
			. '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>'
			. '</button>';
	}
	if ( $controls ) {
		$classes[] = 'marquezy-bar--has-controls';
		$controls  = '<div class="marquezy-controls">' . $controls . '</div>';
	}

	$separator = marquezy_get_separator_html( (string) $o['separator'] );
	$cycle     = '';
	foreach ( marquezy_get_frames() as $frame ) {
		$cycle .= '<span class="marquezy-frame">' . $frame . '</span>' . $separator;
	}

	$html = sprintf(
		'<div id="marquezy-bar" class="%1$s" style="%2$s" role="marquee" aria-label="%3$s" data-marquezy-pos="%4$s" data-marquezy-speed="%7$d">'
		. '<div class="marquezy-track"><div class="marquezy-group"><div class="marquezy-cycle">%5$s</div></div></div>'
		. '%6$s'
		. '</div>',
		esc_attr( implode( ' ', $classes ) ),
		esc_attr( $style ),
		esc_attr__( 'Announcements', 'marquezy' ),
		esc_attr( $position ),
		$cycle,
		$controls,
		(int) $o['speed']
	);

	return $html;
}

/**
 * Return the markup once per request (empty string afterwards or when hidden).
 */
function marquezy_render_once( string $position ): string {
	static $done = false;
	if ( $done || ! marquezy_should_display() ) {
		return '';
	}
	$done = true;
	return marquezy_get_marquee_html( $position );
}

/*
 * Block themes: template-canvas.php renders the template before wp_head()/wp_body_open(),
 * so the marquee is appended right after the header template part on the server.
 * Skipped when a custom header selector is set (JS places it then).
 */
add_filter( 'render_block_core/template-part', function ( $block_content, $block ) {
	if ( is_admin() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return $block_content;
	}
	$attrs     = $block['attrs'] ?? [];
	$is_header = 'header' === ( $attrs['area'] ?? '' )
		|| 'header' === ( $attrs['tagName'] ?? '' )
		|| 'header' === ( $attrs['slug'] ?? '' );

	if ( ! $is_header || '' !== marquezy_get_options()['header_selector'] ) {
		return $block_content;
	}
	return $block_content . marquezy_render_once( 'header' );
}, 10, 2 );

/*
 * Closed by the visitor: flag <html> in <head> so CSS hides the bar before first paint.
 * (Kept out of the marquee markup: block template HTML passes through content filters.)
 */
add_action( 'wp_head', function () {
	if ( ! marquezy_should_display() || ! marquezy_get_options()['close_button'] ) {
		return;
	}
	// Stored value: "<hash>" (session) or "<hash>|<expires ms>" (day/week).
	wp_print_inline_script_tag(
		'try{var h="' . esc_js( marquezy_content_hash() ) . '",k="marquezy_closed",l=(localStorage.getItem(k)||"").split("|");'
		. 'if(sessionStorage.getItem(k)===h||(l[0]===h&&Date.now()<+l[1])){document.documentElement.classList.add("marquezy-closed");}}catch(e){}'
	);
}, 1 );

/* Classic themes: top of <body>; JS moves it after the detected header. */
add_action( 'wp_body_open', function () {
	echo marquezy_render_once( 'body' ); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped in marquezy_get_marquee_html().
} );

/* Themes without wp_body_open(): render in the footer; JS relocates it. */
add_action( 'wp_footer', function () {
	echo marquezy_render_once( 'footer' ); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped in marquezy_get_marquee_html().
} );

/* ══════════════════════════════════════════════════
 * 11. Settings link on plugins page
 * ══════════════════════════════════════════════════ */
add_filter( 'plugin_action_links_' . MARQUEZY_PLUGIN_BASENAME, function ( $links ) {
	$url  = admin_url( 'options-general.php?page=marquezy' );
	$link = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'marquezy' ) . '</a>';
	array_unshift( $links, $link );
	return $links;
} );

/* ══════════════════════════════════════════════════
 * 12. Assets registration (shared by the global bar and the blocks)
 * ══════════════════════════════════════════════════ */
add_action( 'init', function () {
	wp_register_style( 'marquezy', MARQUEZY_PLUGIN_URL . 'assets/css/marquee.css', [], MARQUEZY_VERSION );
	wp_register_script( 'marquezy', MARQUEZY_PLUGIN_URL . 'assets/js/marquee.js', [], MARQUEZY_VERSION, [
		'strategy'  => 'defer',
		'in_footer' => true,
	] );

	wp_register_script(
		'marquezy-editor',
		MARQUEZY_PLUGIN_URL . 'assets/js/block-editor.js',
		[ 'marquezy', 'wp-block-editor', 'wp-blocks', 'wp-components', 'wp-data', 'wp-element', 'wp-i18n', 'wp-server-side-render' ],
		MARQUEZY_VERSION,
		true
	);
	wp_set_script_translations( 'marquezy-editor', 'marquezy' );
	wp_register_style( 'marquezy-editor', MARQUEZY_PLUGIN_URL . 'assets/css/block-editor.css', [], MARQUEZY_VERSION );

	register_block_type( MARQUEZY_PLUGIN_DIR . 'blocks/marquee', [ 'render_callback' => 'marquezy_render_block_marquee' ] );
	register_block_type( MARQUEZY_PLUGIN_DIR . 'blocks/marquee-row', [ 'render_callback' => 'marquezy_render_block_marquee_row' ] );
}, 5 );

/* Settings link for the block's "global" mode. */
add_action( 'enqueue_block_editor_assets', function () {
	wp_add_inline_script(
		'marquezy-editor',
		'window.marquezyBlockData = ' . wp_json_encode( [
			'settingsUrl'  => admin_url( 'options-general.php?page=marquezy' ),
			'rowPresets'   => marquezy_row_presets(),
			'globalActive' => (bool) marquezy_get_options()['enabled'] && (bool) marquezy_get_frames(),
		] ) . ';',
		'before'
	);
} );

/* ══════════════════════════════════════════════════
 * 13. Block render callbacks
 * ══════════════════════════════════════════════════ */

/**
 * Loop markup shared by rows: .marquezy-track > .marquezy-group > .marquezy-cycle (frames + separators).
 *
 * @param string[] $frames Sanitized frame HTML.
 */
function marquezy_build_cycle( array $frames, string $separator ): string {
	$sep   = marquezy_get_separator_html( $separator );
	$cycle = '';
	foreach ( $frames as $frame ) {
		$cycle .= '<span class="marquezy-frame">' . $frame . '</span>' . $sep;
	}
	return '<div class="marquezy-track"><div class="marquezy-group"><div class="marquezy-cycle">' . $cycle . '</div></div></div>';
}

/**
 * Separator shape key, validated.
 */
function marquezy_separator_key( $value ): string {
	return in_array( $value, [ 'none', 'bar', 'dot', 'star', 'diamond', 'asterisk', 'dash' ], true ) ? $value : 'star';
}

/**
 * Per-row separator size, color and spacing as custom properties (empty color = the row's text color).
 */
function marquezy_separator_vars( $size, $color, $gap ): string {
	$vars  = '--marquezy-sep-size:' . (int) marquezy_block_number( $size, 8, 64, 16 ) . 'px;';
	$vars .= '--marquezy-gap:' . (int) marquezy_block_number( $gap, 0, 300, 32 ) . 'px;';
	$color = marquezy_sanitize_color( (string) $color );
	if ( '' !== $color ) {
		$vars .= '--marquezy-sep-color:' . $color . ';';
	}
	return $vars;
}

/**
 * Tilt angle (negative = the other way) plus its absolute value for the reserved height.
 */
function marquezy_angle_vars( float $angle ): string {
	return '--marquezy-angle:' . marquezy_css_number( $angle ) . 'deg;--marquezy-angle-abs:' . marquezy_css_number( abs( $angle ) ) . 'deg;';
}

/**
 * Number for CSS/HTML output — always a dot decimal separator (PHP < 8 follows LC_NUMERIC).
 */
function marquezy_css_number( float $n ): string {
	$s = sprintf( '%.2F', $n );
	return false !== strpos( $s, '.' ) ? rtrim( rtrim( $s, '0' ), '.' ) : $s;
}

function marquezy_block_number( $value, float $min, float $max, float $default ): float {
	return is_numeric( $value ) ? max( $min, min( $max, (float) $value ) ) : $default;
}

/**
 * Marquee block: wrapper, layout (straight / tilt / cross) and — in "global" mode — the global bar's content.
 */
function marquezy_render_block_marquee( array $attrs, string $content, WP_Block $block ): string {
	$mode   = ( $attrs['mode'] ?? 'custom' ) === 'global' ? 'global' : 'custom';
	$layout = in_array( $attrs['layout'] ?? '', [ 'straight', 'tilt', 'cross' ], true ) ? $attrs['layout'] : 'straight';
	$angle  = marquezy_block_number( $attrs['angle'] ?? 4, -10, 10, 4 );
	$speed  = marquezy_block_number( $attrs['speed'] ?? 60, 10, 300, 60 );

	if ( 'global' === $mode ) {
		$rows = marquezy_render_global_row( ! empty( $attrs['pauseOnHover'] ) );
		$vars = '';
		if ( 'cross' === $layout ) {
			$layout = 'tilt'; // crossing needs two rows
		}
	} else {
		$rows     = $content;
		$rendered = 0;
		foreach ( $block->inner_blocks as $row ) {
			if ( marquezy_row_frames( $row ) ) {
				$rendered++;
			}
		}
		if ( 'cross' === $layout && $rendered < 2 ) {
			$layout = 'tilt'; // crossing needs two rows with phrases
		}
		$vars = '--marquezy-row-gap:' . (int) marquezy_block_number( $attrs['rowGap'] ?? 0, 0, 80, 0 ) . 'px;';
	}

	if ( '' === trim( $rows ) ) {
		return '';
	}
	if ( 'straight' === $layout ) {
		$angle = 0;
	}

	// Crossing point: horizontal offset of the intersection, % of the block width (container units).
	$cross = 'cross' === $layout ? (int) marquezy_block_number( $attrs['crossPoint'] ?? 0, -40, 40, 0 ) : 0;
	if ( $cross ) {
		$vars .= '--marquezy-cross:' . $cross . 'cqw;--marquezy-cross-abs:' . abs( $cross ) . 'cqw;';
	}

	$wrapper = get_block_wrapper_attributes( [
		'class'          => 'marquezy-block marquezy-block--' . $layout,
		'data-marquezy-speed' => marquezy_css_number( $speed ),
		'role'           => 'marquee',
		'aria-label'     => __( 'Announcements', 'marquezy' ),
	] );
	$wrapper = marquezy_wrapper_with_style( $wrapper, $vars . marquezy_angle_vars( $angle ) );

	return '<div ' . $wrapper . '><div class="marquezy-stage"><div class="marquezy-rows">' . $rows . '</div></div></div>';
}

/**
 * Marquee row block: paragraphs → frames; colors, typography, padding from block supports; custom shadow.
 */
/**
 * Phrases of a row block: its paragraphs, flattened and sanitized.
 *
 * @return string[]
 */
function marquezy_row_frames( WP_Block $block ): array {
	$frames = [];
	foreach ( $block->inner_blocks as $inner ) {
		if ( 'core/paragraph' !== $inner->name ) {
			continue;
		}
		$html = marquezy_flatten_html( (string) ( $inner->parsed_block['innerHTML'] ?? '' ) );
		if ( marquezy_has_visible_text( $html ) ) {
			$frames[] = wp_kses_post( $html );
		}
	}
	return $frames;
}

function marquezy_render_block_marquee_row( array $attrs, string $content, WP_Block $block ): string {
	$frames = marquezy_row_frames( $block );
	if ( ! $frames ) {
		return '';
	}

	$direction = ( $attrs['direction'] ?? 'left' ) === 'right' ? 'right' : 'left';
	$separator = marquezy_separator_key( $attrs['separator'] ?? 'star' );
	$pause     = $block->context['marquezy/pauseOnHover'] ?? true;

	$style = marquezy_separator_vars( $attrs['separatorSize'] ?? 16, $attrs['separatorColor'] ?? '', $attrs['gap'] ?? 32 );
	if ( ! empty( $attrs['shadow'] ) ) {
		$color = marquezy_sanitize_color( $attrs['shadowColor'] ?? '' ) ?: '#00000059';
		$style .= sprintf(
			'box-shadow:%dpx %dpx %dpx %dpx %s;',
			(int) marquezy_block_number( $attrs['shadowX'] ?? 0, -60, 60, 0 ),
			(int) marquezy_block_number( $attrs['shadowY'] ?? 8, -60, 60, 8 ),
			(int) marquezy_block_number( $attrs['shadowBlur'] ?? 24, 0, 120, 24 ),
			(int) marquezy_block_number( $attrs['shadowSpread'] ?? 0, -40, 40, 0 ),
			$color
		);
	}

	$wrapper = get_block_wrapper_attributes( [
		'class' => 'marquezy-row marquezy-loop marquezy-row--' . $direction . ( $pause ? ' marquezy-hover-pause' : '' ),
	] );
	$wrapper = marquezy_wrapper_with_style( $wrapper, $style );

	return '<div ' . $wrapper . '>' . marquezy_build_cycle( $frames, $separator ) . '</div>';
}

/**
 * One row with the global bar's phrases and styles (block "global" mode).
 */
function marquezy_render_global_row( bool $pause ): string {
	$o = marquezy_get_options();
	if ( empty( $o['enabled'] ) || ! marquezy_get_frames() ) {
		return '';
	}

	$style = sprintf(
		'background-color:%1$s;color:%2$s;font-size:%3$dpx;--marquezy-link:%4$s;--marquezy-gap:%5$dpx;--marquezy-sep-size:%6$dpx;%7$s',
		$o['bg_color'],
		$o['text_color'],
		(int) $o['font_size'],
		$o['link_color'],
		(int) $o['gap'],
		(int) $o['separator_size'],
		$o['separator_color'] ? '--marquezy-sep-color:' . $o['separator_color'] . ';' : ''
	);

	return sprintf(
		'<div class="marquezy-row marquezy-row--global marquezy-loop marquezy-row--left%1$s" style="%2$s" data-marquezy-speed="%3$d">%4$s</div>',
		$pause ? ' marquezy-hover-pause' : '',
		esc_attr( $style ),
		(int) $o['speed'],
		marquezy_build_cycle( marquezy_get_frames(), (string) $o['separator'] )
	);
}

/* ══════════════════════════════════════════════════
 * 14. Shortcodes — [marquezy id="N"] for page builders / Classic editor,
 *     [marquezy] without id = the global bar's content.
 *     Configs are built on Settings → Marquezy → Shortcodes.
 * ══════════════════════════════════════════════════ */
/**
 * Starting colors of new rows (block and shortcode builder) — "Rose & Plum".
 * Only initial values: every row's colors stay editable. Filterable for themes/agencies.
 */
function marquezy_row_presets(): array {
	return apply_filters( 'marquezy_row_presets', [
		[ 'bg' => '#F06A8F', 'text' => '#FFFFFF' ],
		[ 'bg' => '#5B2A4E', 'text' => '#FCE4EC' ],
		[ 'bg' => '#FCE4EC', 'text' => '#5B2A4E' ],
	] );
}

function marquezy_shortcode_row_defaults(): array {
	return [
		'direction'      => 'left',
		'separator'      => 'star',
		'separatorColor' => '',
		'separatorSize'  => 16,
		'gap'            => 32,
		'bg'           => marquezy_row_presets()[0]['bg'],
		'text'         => marquezy_row_presets()[0]['text'],
		'link'         => '',
		'fontSize'     => 18,
		'padding'      => 12,
		'shadow'       => false,
		'shadowColor'  => '#00000059',
		'shadowX'      => 0,
		'shadowY'      => 8,
		'shadowBlur'   => 24,
		'shadowSpread' => 0,
		'phrases'      => [],
	];
}

function marquezy_shortcode_defaults(): array {
	return [
		'id'             => 0,
		'name'           => '',
		'layout'         => 'straight',
		'angle'          => 4,
		'crossPoint'     => 0,
		'speed'          => 60,
		'rowGap'         => 0,
		'pauseOnHover'   => true,
		'rows'           => [],
	];
}

function marquezy_shortcodes_schema(): array {
	$int = [ 'type' => 'integer' ];
	$num = [ 'type' => 'number' ];
	$str = [ 'type' => 'string' ];
	$row = [
		'type'                 => 'object',
		'additionalProperties' => false,
		'properties'           => [
			'direction'      => [ 'type' => 'string', 'enum' => [ 'left', 'right' ] ],
			'separator'      => [ 'type' => 'string', 'enum' => [ 'none', 'bar', 'dot', 'star', 'diamond', 'asterisk', 'dash' ] ],
			'separatorColor' => $str,
			'separatorSize'  => $int,
			'gap'            => $int,
			'bg'           => $str,
			'text'         => $str,
			'link'         => $str,
			'fontSize'     => $int,
			'padding'      => $int,
			'shadow'       => [ 'type' => 'boolean' ],
			'shadowColor'  => $str,
			'shadowX'      => $int,
			'shadowY'      => $int,
			'shadowBlur'   => $int,
			'shadowSpread' => $int,
			'phrases'      => [ 'type' => 'array', 'items' => $str ],
		],
	];
	return [
		'type'  => 'array',
		'items' => [
			'type'                 => 'object',
			'additionalProperties' => false,
			'properties'           => [
				'id'             => $int,
				'name'           => $str,
				'layout'         => [ 'type' => 'string', 'enum' => [ 'straight', 'tilt', 'cross' ] ],
				'angle'          => $num,
				'crossPoint'     => $int,
				'speed'          => $int,
				'rowGap'         => $int,
				'pauseOnHover'   => [ 'type' => 'boolean' ],
				'rows'           => [ 'type' => 'array', 'items' => $row, 'maxItems' => 3 ],
			],
		],
	];
}

add_action( 'init', function () {
	register_setting( 'marquezy_settings_group', 'marquezy_shortcodes', [
		'type'              => 'array',
		'sanitize_callback' => 'marquezy_sanitize_shortcodes',
		'default'           => [],
		'show_in_rest'      => [ 'schema' => marquezy_shortcodes_schema() ],
	] );
} );

function marquezy_sanitize_shortcodes( $input ): array {
	$out  = [];
	$used = [];
	foreach ( is_array( $input ) ? $input : [] as $item ) {
		if ( ! is_array( $item ) ) continue;
		$d = marquezy_shortcode_defaults();
		$c = [
			'id'             => absint( $item['id'] ?? 0 ),
			'name'           => sanitize_text_field( $item['name'] ?? '' ),
			'layout'         => in_array( $item['layout'] ?? '', [ 'straight', 'tilt', 'cross' ], true ) ? $item['layout'] : 'straight',
			'angle'          => round( marquezy_block_number( $item['angle'] ?? $d['angle'], -10, 10, 4 ) * 2 ) / 2,
			'crossPoint'     => (int) marquezy_block_number( $item['crossPoint'] ?? 0, -40, 40, 0 ),
			'speed'          => (int) marquezy_block_number( $item['speed'] ?? 60, 10, 300, 60 ),
			'rowGap'         => (int) marquezy_block_number( $item['rowGap'] ?? 0, 0, 80, 0 ),
			'pauseOnHover'   => isset( $item['pauseOnHover'] ) ? ! empty( $item['pauseOnHover'] ) : true,
			'rows'           => [],
		];
		foreach ( array_slice( (array) ( $item['rows'] ?? [] ), 0, 3 ) as $row ) {
			if ( ! is_array( $row ) ) continue;
			$rd = marquezy_shortcode_row_defaults();
			$phrases = [];
			foreach ( (array) ( $row['phrases'] ?? [] ) as $html ) {
				$html = marquezy_flatten_html( (string) $html );
				if ( marquezy_has_visible_text( $html ) ) {
					$phrases[] = wp_kses_post( $html );
				}
			}
			$c['rows'][] = [
				'direction'      => ( $row['direction'] ?? '' ) === 'right' ? 'right' : 'left',
				'separator'      => marquezy_separator_key( $row['separator'] ?? 'star' ),
				'separatorColor' => marquezy_sanitize_color( $row['separatorColor'] ?? '' ),
				'separatorSize'  => (int) marquezy_block_number( $row['separatorSize'] ?? 16, 8, 64, 16 ),
				'gap'            => (int) marquezy_block_number( $row['gap'] ?? 32, 0, 300, 32 ),
				'bg'           => marquezy_sanitize_color( $row['bg'] ?? '' ),
				'text'         => marquezy_sanitize_color( $row['text'] ?? '' ),
				'link'         => marquezy_sanitize_color( $row['link'] ?? '' ),
				'fontSize'     => (int) marquezy_block_number( $row['fontSize'] ?? $rd['fontSize'], 0, 200, $rd['fontSize'] ),
				'padding'      => (int) marquezy_block_number( $row['padding'] ?? $rd['padding'], 0, 120, $rd['padding'] ),
				'shadow'       => ! empty( $row['shadow'] ),
				'shadowColor'  => marquezy_sanitize_color( $row['shadowColor'] ?? '' ) ?: $rd['shadowColor'],
				'shadowX'      => (int) marquezy_block_number( $row['shadowX'] ?? 0, -60, 60, 0 ),
				'shadowY'      => (int) marquezy_block_number( $row['shadowY'] ?? 8, -60, 60, 8 ),
				'shadowBlur'   => (int) marquezy_block_number( $row['shadowBlur'] ?? 24, 0, 120, 24 ),
				'shadowSpread' => (int) marquezy_block_number( $row['shadowSpread'] ?? 0, -40, 40, 0 ),
				'phrases'      => $phrases,
			];
		}
		// Unique positive ids (new items come with 0).
		if ( ! $c['id'] || isset( $used[ $c['id'] ] ) ) {
			$c['id'] = 0;
		}
		if ( $c['id'] ) {
			$used[ $c['id'] ] = true;
		}
		$out[] = $c;
	}
	// Ids only grow: a deleted shortcode's id is never reused, so old embeds show nothing instead of another marquee.
	$next = max( (int) get_option( 'marquezy_shortcodes_next_id', 1 ), $used ? max( array_keys( $used ) ) + 1 : 1 );
	foreach ( $out as &$c ) {
		if ( ! $c['id'] ) {
			$c['id'] = $next++;
		}
	}
	unset( $c );
	if ( $next > (int) get_option( 'marquezy_shortcodes_next_id', 1 ) ) {
		update_option( 'marquezy_shortcodes_next_id', $next, false );
	}
	return $out;
}

function marquezy_get_shortcodes(): array {
	$list = get_option( 'marquezy_shortcodes', [] );
	return is_array( $list ) ? $list : [];
}

/**
 * Shared outer markup of the block and the shortcode: .marquezy-block > .marquezy-stage > .marquezy-rows.
 */
function marquezy_layout_html( string $layout, float $angle, int $cross, float $speed, string $vars, string $rows_html, string $extra_class = '' ): string {
	if ( 'straight' === $layout ) {
		$angle = 0;
	}
	if ( 'cross' === $layout && $cross ) {
		$vars .= '--marquezy-cross:' . $cross . 'cqw;--marquezy-cross-abs:' . abs( $cross ) . 'cqw;';
	}
	return sprintf(
		'<div class="marquezy-block marquezy-block--%1$s%2$s" style="%3$s" data-marquezy-speed="%4$s" role="marquee" aria-label="%5$s"><div class="marquezy-stage"><div class="marquezy-rows">%6$s</div></div></div>',
		esc_attr( $layout ),
		$extra_class ? ' ' . esc_attr( $extra_class ) : '',
		esc_attr( $vars . marquezy_angle_vars( $angle ) ),
		esc_attr( marquezy_css_number( $speed ) ),
		esc_attr__( 'Announcements', 'marquezy' ),
		$rows_html
	);
}

function marquezy_render_shortcode_row( array $row, bool $pause ): string {
	$frames = [];
	foreach ( (array) ( $row['phrases'] ?? [] ) as $html ) {
		$html = marquezy_flatten_html( (string) $html );
		if ( marquezy_has_visible_text( $html ) ) {
			$frames[] = wp_kses_post( $html );
		}
	}
	if ( ! $frames ) {
		return '';
	}

	$style = marquezy_separator_vars( $row['separatorSize'] ?? 16, $row['separatorColor'] ?? '', $row['gap'] ?? 32 );
	foreach ( [ 'bg' => 'background-color', 'text' => 'color', 'link' => '--marquezy-link' ] as $key => $prop ) {
		$color = marquezy_sanitize_color( $row[ $key ] ?? '' );
		if ( '' !== $color ) {
			$style .= $prop . ':' . $color . ';';
		}
	}
	if ( ! empty( $row['fontSize'] ) ) {
		$style .= 'font-size:' . (int) $row['fontSize'] . 'px;';
	}
	if ( isset( $row['padding'] ) ) {
		$style .= 'padding-block:' . (int) $row['padding'] . 'px;';
	}
	if ( ! empty( $row['shadow'] ) ) {
		$style .= sprintf(
			'box-shadow:%dpx %dpx %dpx %dpx %s;',
			(int) ( $row['shadowX'] ?? 0 ),
			(int) ( $row['shadowY'] ?? 8 ),
			(int) ( $row['shadowBlur'] ?? 24 ),
			(int) ( $row['shadowSpread'] ?? 0 ),
			marquezy_sanitize_color( $row['shadowColor'] ?? '' ) ?: '#00000059'
		);
	}

	return sprintf(
		'<div class="marquezy-row marquezy-row--custom marquezy-loop marquezy-row--%1$s%2$s" style="%3$s">%4$s</div>',
		( $row['direction'] ?? '' ) === 'right' ? 'right' : 'left',
		$pause ? ' marquezy-hover-pause' : '',
		esc_attr( $style ),
		marquezy_build_cycle( $frames, marquezy_separator_key( $row['separator'] ?? 'star' ) )
	);
}

function marquezy_enqueue_front_assets(): void {
	wp_enqueue_style( 'marquezy' );
	wp_enqueue_script( 'marquezy' );
}

add_shortcode( 'marquezy', function ( $atts ) {
	$atts = shortcode_atts( [ 'id' => 0 ], $atts, 'marquezy' );
	$id   = absint( $atts['id'] );

	// No id: the global bar's phrases and styles as one row.
	if ( ! $id ) {
		$row = marquezy_render_global_row( true );
		if ( '' === $row ) {
			return '';
		}
		marquezy_enqueue_front_assets();
		return marquezy_layout_html( 'straight', 0, 0, (float) marquezy_get_options()['speed'], '', $row, 'marquezy-block--shortcode' );
	}

	$config = null;
	foreach ( marquezy_get_shortcodes() as $item ) {
		if ( (int) ( $item['id'] ?? 0 ) === $id ) {
			$config = wp_parse_args( $item, marquezy_shortcode_defaults() );
			break;
		}
	}
	if ( ! $config ) {
		return current_user_can( 'manage_options' )
			? '<!-- ' . esc_html( sprintf( 'Marquezy: shortcode %d not found', $id ) ) . ' -->'
			: '';
	}

	$rows     = '';
	$rendered = 0;
	$max      = 'cross' === $config['layout'] ? 2 : 3; // crossing = exactly two rows
	foreach ( array_slice( (array) $config['rows'], 0, $max ) as $row ) {
		$html = marquezy_render_shortcode_row( (array) $row, ! empty( $config['pauseOnHover'] ) );
		if ( '' !== $html ) {
			$rows .= $html;
			$rendered++;
		}
	}
	if ( ! $rendered ) {
		return '';
	}

	$layout = in_array( $config['layout'], [ 'straight', 'tilt', 'cross' ], true ) ? $config['layout'] : 'straight';
	if ( 'cross' === $layout && $rendered < 2 ) {
		$layout = 'tilt';
	}
	$vars = '--marquezy-row-gap:' . (int) $config['rowGap'] . 'px;';

	marquezy_enqueue_front_assets();
	return marquezy_layout_html(
		$layout,
		marquezy_block_number( $config['angle'], -10, 10, 4 ),
		(int) marquezy_block_number( $config['crossPoint'], -40, 40, 0 ),
		marquezy_block_number( $config['speed'], 10, 300, 60 ),
		$vars,
		$rows,
		'marquezy-block--shortcode'
	);
} );

/* Load CSS in <head> when the shortcode is in the post content (builders that store content elsewhere get it enqueued late). */
add_action( 'wp_enqueue_scripts', function () {
	if ( is_singular() ) {
		$post = get_post();
		if ( $post && has_shortcode( (string) $post->post_content, 'marquezy' ) ) {
			marquezy_enqueue_front_assets();
		}
	}
} );
