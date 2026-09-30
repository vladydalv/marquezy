/**
 * Marquezy — block editor (Marquee + Marquee row).
 * wp.element + wp.components, no JSX, no build step.
 *
 * Marquee (parent): mode (own rows / global bar), layout (straight / tilt / cross), angle, 1–3 rows,
 * speed, spacing. Rows are locked children created by the parent (templateLock: all).
 * Marquee row: phrases are core/paragraph blocks; colors, typography and padding come from native
 * block supports; direction, separator and shadow are block attributes.
 * A live preview above the rows runs the same loop code and markup as the front end; the row editors
 * show while the block (or one of its rows) is selected.
 */
( function ( wp ) {
	'use strict';

	var el            = wp.element.createElement;
	var Fragment      = wp.element.Fragment;
	var useEffect     = wp.element.useEffect;
	var useRef        = wp.element.useRef;
	var BE            = wp.blockEditor;
	var C             = wp.components;
	var useSelect     = wp.data.useSelect;
	var useDispatch   = wp.data.useDispatch;
	var __            = wp.i18n.__;
	var sprintf       = wp.i18n.sprintf;
	var PARENT        = 'marquezy/marquee';
	var ROW           = 'marquezy/marquee-row';
	var DATA          = window.marquezyBlockData || {};
	var CTRL          = { __nextHasNoMarginBottom: true, __next40pxDefaultSize: true };

	/* ═══ Separators (same markup as PHP marquezy_get_separator_html) ═══ */
	var SEP = {
		bar: '<svg xmlns="http://www.w3.org/2000/svg" width="0.12em" height="1em" viewBox="0 0 2 16" fill="currentColor" focusable="false"><rect width="2" height="16" rx="1"/></svg>',
		dot: '<svg xmlns="http://www.w3.org/2000/svg" width="0.4em" height="0.4em" viewBox="0 0 10 10" fill="currentColor" focusable="false"><circle cx="5" cy="5" r="5"/></svg>',
		dash: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="0.12em" viewBox="0 0 16 2" fill="currentColor" focusable="false"><rect width="16" height="2" rx="1"/></svg>',
		star: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>',
		diamond: '<svg xmlns="http://www.w3.org/2000/svg" width="0.8em" height="0.8em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><polygon points="12,2 22,12 12,22 2,12"/></svg>',
		asterisk: '<svg xmlns="http://www.w3.org/2000/svg" width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2Z"/></svg>'
	};
	var SEP_OPTIONS = [
		{ value: 'none', label: __( 'None', 'marquezy' ) },
		{ value: 'star', label: __( 'Star', 'marquezy' ) },
		{ value: 'asterisk', label: __( '4-point star', 'marquezy' ) },
		{ value: 'diamond', label: __( 'Diamond', 'marquezy' ) },
		{ value: 'dot', label: __( 'Dot', 'marquezy' ) },
		{ value: 'bar', label: __( 'Bar', 'marquezy' ) },
		{ value: 'dash', label: __( 'Dash', 'marquezy' ) }
	];

	/* One-line segmented control (same look as the settings page) */
	function Segmented( props ) {
		return el( 'div', { className: 'marquezy-seg-control' },
			el( 'div', { className: 'marquezy-control-label' }, props.label ),
			el( 'div', { className: 'marquezy-seg', role: 'radiogroup', 'aria-label': props.label },
				props.options.map( function ( o ) {
					var on = o.value === props.value;
					return el( 'button', {
							key: o.value, type: 'button', role: 'radio', 'aria-checked': on,
							className: 'marquezy-seg__btn' + ( on ? ' is-active' : '' ),
							onClick: function () { props.onChange( o.value ); }
						},
						o.iconBefore ? el( C.Dashicon, { icon: o.iconBefore } ) : null,
						el( 'span', null, o.label ),
						o.iconAfter ? el( C.Dashicon, { icon: o.iconAfter } ) : null );
				} ) ),
			props.help ? el( 'p', { className: 'marquezy-inspector-note' }, props.help ) : null );
	}

	/* Separator shapes as small inline icons (same shapes as the front end) */
	function SeparatorPicker( props ) {
		return el( 'div', { className: 'marquezy-seg-control' },
			el( 'div', { className: 'marquezy-control-label' }, __( 'Separator', 'marquezy' ) ),
			el( 'div', { className: 'marquezy-sep-picker', role: 'radiogroup', 'aria-label': __( 'Separator', 'marquezy' ) },
				SEP_OPTIONS.map( function ( o ) {
					var on = props.value === o.value;
					return el( C.Button, {
						key: o.value,
						className: 'marquezy-sep-option' + ( on ? ' is-active' : '' ),
						role: 'radio',
						'aria-checked': on,
						label: o.label,
						showTooltip: true,
						onClick: function () { props.onChange( o.value ); }
					}, o.value === 'none'
						? el( 'span', { className: 'marquezy-sep-none', 'aria-hidden': true }, '∅' )
						: el( 'span', { className: 'marquezy-sep-icon', 'aria-hidden': true, dangerouslySetInnerHTML: { __html: SEP[ o.value ] } } ) );
				} ) ) );
	}

	function sepHTML( key ) {
		return SEP[ key ]
			? '<span class="marquezy-sep" aria-hidden="true">' + SEP[ key ] + '</span>'
			: '<span class="marquezy-sep marquezy-sep--none" aria-hidden="true"></span>';
	}

	function hasText( html ) {
		var div = document.createElement( 'div' );
		div.innerHTML = html;
		return div.textContent.replace( / /g, '' ).trim() !== '';
	}

	/* ═══ Row defaults: chessboard directions + preset colors (PHP marquezy_row_presets) ═══ */
	function rowDefaults( index ) {
		var attrs  = { direction: index % 2 ? 'right' : 'left' }; // left, right, left
		var preset = ( DATA.rowPresets || [] )[ index ];
		if ( preset ) {
			attrs.style = { color: { background: preset.bg, text: preset.text } };
		}
		return attrs;
	}

	function makeRow( index ) {
		return wp.blocks.createBlock( ROW, rowDefaults( index ), [
			wp.blocks.createBlock( 'core/paragraph', { placeholder: __( 'Phrase…', 'marquezy' ) } )
		] );
	}

	/* ═══ Block icons (fill comes from the editor's currentColor) ═══ */
	var ICON_MARQUEE = el( 'svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': true, focusable: false },
		el( 'path', { d: 'M3.46 17.77 1.75 13.07 20.54 6.23 22.25 10.93ZM4.88 15.23 8.07 14.07 7.66 12.94 4.47 14.1ZM18.78 10.17 18.37 9.04 15.18 10.2 15.59 11.33ZM20.54 17.77 13.9 15.35 21.21 12.69 22.25 13.07ZM3.46 6.23 10.1 8.65 2.79 11.31 1.75 10.93Z' } ) );
	var ICON_ROW = el( 'svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': true, focusable: false },
		el( 'path', { d: 'M2 8H22V16H2ZM4.5 11.4V12.6H8.5V11.4ZM10 11.4V12.6H14V11.4ZM15.5 11.4V12.6H19.5V11.4Z' } ) );

	/* Preview animation on/off — one choice for every preview (settings page and editor), kept in this browser. */
	var PAUSE_KEY = 'marquezy-preview-paused';
	function usePreviewPaused() {
		var st = wp.element.useState( function () {
			try { return window.localStorage.getItem( PAUSE_KEY ) === '1'; } catch ( e ) { return false; }
		} );
		useEffect( function () {
			function sync( e ) { st[ 1 ]( !! e.detail ); }
			window.addEventListener( PAUSE_KEY, sync );
			return function () { window.removeEventListener( PAUSE_KEY, sync ); };
		}, [] );
		return [ st[ 0 ], function ( on ) {
			try { window.localStorage.setItem( PAUSE_KEY, on ? '1' : '0' ); } catch ( e ) { /* private mode: this page only */ }
			window.dispatchEvent( new CustomEvent( PAUSE_KEY, { detail: on } ) );
		} ];
	}

	/* ═══ Live preview: the same markup as PHP marquezy_render_block_marquee(_row) ═══ */
	function escAttr( v ) {
		return String( v ).replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' );
	}
	// "var:preset|color|slug" → "var(--wp--preset--color--slug)"
	function presetVar( v ) {
		return typeof v === 'string' && v.indexOf( 'var:' ) === 0 ? 'var(--wp--' + v.slice( 4 ).split( '|' ).join( '--' ) + ')' : v;
	}
	function pick( obj, path ) {
		return path.split( '.' ).reduce( function ( o, k ) { return o && o[ k ] !== undefined ? o[ k ] : undefined; }, obj );
	}

	function rowPreviewHtml( block, pause ) {
		var a      = block.attributes;
		var frames = block.innerBlocks
			.filter( function ( b ) { return b.name === 'core/paragraph'; } )
			.map( function ( b ) { return String( b.attributes.content || '' ); } )
			.filter( hasText );
		if ( ! frames.length ) return '';

		var cls = [ 'marquezy-row', 'marquezy-loop', 'marquezy-row--' + ( a.direction === 'right' ? 'right' : 'left' ) ];
		if ( pause ) cls.push( 'marquezy-hover-pause' );
		var css = '--marquezy-sep-size:' + a.separatorSize + 'px;--marquezy-gap:' + a.gap + 'px;';
		if ( a.separatorColor ) css += '--marquezy-sep-color:' + a.separatorColor + ';';

		// Block supports: preset slugs → classes, custom values → inline styles.
		var st = a.style || {};
		if ( a.backgroundColor ) cls.push( 'has-background', 'has-' + a.backgroundColor + '-background-color' );
		else if ( pick( st, 'color.background' ) ) css += 'background-color:' + st.color.background + ';';
		if ( a.textColor ) cls.push( 'has-text-color', 'has-' + a.textColor + '-color' );
		else if ( pick( st, 'color.text' ) ) css += 'color:' + st.color.text + ';';
		var link = pick( st, 'elements.link.color.text' );
		if ( link ) { cls.push( 'marquezy-row--custom' ); css += '--marquezy-link:' + presetVar( link ) + ';'; }
		if ( a.fontSize ) cls.push( 'has-' + a.fontSize + '-font-size' );
		else if ( pick( st, 'typography.fontSize' ) ) css += 'font-size:' + presetVar( st.typography.fontSize ) + ';';
		if ( pick( st, 'typography.lineHeight' ) ) css += 'line-height:' + st.typography.lineHeight + ';';
		if ( pick( st, 'spacing.padding.top' ) ) css += 'padding-top:' + presetVar( st.spacing.padding.top ) + ';';
		if ( pick( st, 'spacing.padding.bottom' ) ) css += 'padding-bottom:' + presetVar( st.spacing.padding.bottom ) + ';';
		var shadow = shadowCss( a );
		if ( shadow ) css += 'box-shadow:' + shadow + ';';

		var cycle = frames.map( function ( f ) { return '<span class="marquezy-frame">' + f + '</span>' + sepHTML( a.separator || 'star' ); } ).join( '' );
		return '<div class="' + cls.join( ' ' ) + '" style="' + escAttr( css ) + '"><div class="marquezy-track"><div class="marquezy-group"><div class="marquezy-cycle">' + cycle + '</div></div></div></div>';
	}

	function blockPreviewHtml( a, rows ) {
		var rendered = rows.map( function ( r ) { return rowPreviewHtml( r, a.pauseOnHover ); } ).filter( Boolean );
		if ( ! rendered.length ) return '';
		var layout = a.layout === 'cross' && rendered.length < 2 ? 'tilt' : a.layout;
		var angle  = layout === 'straight' ? 0 : a.angle;
		var vars   = '--marquezy-row-gap:' + a.rowGap + 'px;';
		if ( layout === 'cross' && a.crossPoint ) vars += '--marquezy-cross:' + a.crossPoint + 'cqw;--marquezy-cross-abs:' + Math.abs( a.crossPoint ) + 'cqw;';
		vars += '--marquezy-angle:' + angle + 'deg;--marquezy-angle-abs:' + Math.abs( angle ) + 'deg;';
		return '<div class="marquezy-block marquezy-block--' + layout + '" style="' + escAttr( vars ) + '" data-marquezy-speed="' + a.speed + '">'
			+ '<div class="marquezy-stage"><div class="marquezy-rows">' + rendered.join( '' ) + '</div></div></div>';
	}

	function LivePreview( props ) {
		var ref = useRef();
		useEffect( function () {
			var node = ref.current;
			if ( ! node || ! window.marquezy ) return;
			var destroyers = [];
			node.querySelectorAll( '.marquezy-loop' ).forEach( function ( loop ) {
				destroyers.push( window.marquezy.initLoop( loop ) );
			} );
			return function () { while ( destroyers.length ) destroyers.pop()(); };
		}, [ props.html ] );
		return props.html
			? el( 'div', { ref: ref, key: props.html, className: 'marquezy-live-preview' + ( props.paused ? ' marquezy-preview-paused' : '' ), dangerouslySetInnerHTML: { __html: props.html } } )
			: el( 'div', { className: 'marquezy-live-preview is-empty' }, __( 'Add a phrase to a row to see the preview.', 'marquezy' ) );
	}

	/* ═══════════════════════════════════════
	 * Marquee (parent)
	 * ═══════════════════════════════════════ */
	function GlobalPreview( props ) {
		var ref = useRef();

		// ServerSideRender replaces its content asynchronously — start loops whenever rows appear.
		useEffect( function () {
			var node = ref.current;
			if ( ! node || ! window.marquezy ) return;
			var destroyers = [];
			function start() {
				while ( destroyers.length ) destroyers.pop()();
				node.querySelectorAll( '.marquezy-loop' ).forEach( function ( loop ) {
					destroyers.push( window.marquezy.initLoop( loop ) );
				} );
			}
			var mo = new ( node.ownerDocument.defaultView.MutationObserver )( function ( records ) {
				var relevant = records.some( function ( r ) {
					return Array.prototype.some.call( r.addedNodes, function ( n ) {
						return n.nodeType === 1 && ! n.closest( '.marquezy-track' ) && ( n.classList.contains( 'marquezy-loop' ) || n.querySelector && n.querySelector( '.marquezy-loop' ) );
					} );
				} );
				if ( relevant ) start();
			} );
			mo.observe( node, { childList: true, subtree: true } );
			start();
			return function () {
				mo.disconnect();
				while ( destroyers.length ) destroyers.pop()();
			};
		}, [] );

		return el( 'div', { ref: ref, className: 'marquezy-global-preview' + ( props.paused ? ' marquezy-preview-paused' : '' ) },
			el( wp.serverSideRender, {
				block: PARENT,
				attributes: props.attributes,
				EmptyResponsePlaceholder: function () {
					return el( C.Notice, { status: 'warning', isDismissible: false },
						__( 'The global bar is disabled or has no phrases.', 'marquezy' ), ' ',
						el( 'a', { href: DATA.settingsUrl, target: '_blank', rel: 'noopener noreferrer' }, __( 'Open Marquee settings', 'marquezy' ) ) );
				}
			} ) );
	}

	function MarqueeEdit( props ) {
		var a        = props.attributes;
		var set      = props.setAttributes;
		var clientId = props.clientId;
		var editing  = useSelect( function ( select ) {
			var be = select( 'core/block-editor' );
			return be.isBlockSelected( clientId ) || be.hasSelectedInnerBlock( clientId, true );
		}, [ clientId ] );

		var rows = useSelect( function ( select ) {
			return select( 'core/block-editor' ).getBlocks( clientId );
		}, [ clientId ] );
		var paused = usePreviewPaused();
		var replaceInnerBlocks = useDispatch( 'core/block-editor' ).replaceInnerBlocks;

		function setRowCount( n ) {
			var next = rows.slice( 0, n );
			while ( next.length < n ) next.push( makeRow( next.length ) );
			replaceInnerBlocks( clientId, next, false );
		}

		// New block: start with two rows (chessboard directions).
		useEffect( function () {
			if ( a.mode === 'custom' && rows.length === 0 ) setRowCount( 2 );
		}, [ a.mode, rows.length ] );

		var isGlobal = a.mode === 'global';
		var layout   = isGlobal && a.layout === 'cross' ? 'tilt' : a.layout;
		var tilted   = layout !== 'straight';

		var blockProps = BE.useBlockProps( { className: isGlobal ? 'marquezy-block-global' : 'marquezy-block-edit' } );

		var innerProps = BE.useInnerBlocksProps( { className: 'marquezy-rows' }, {
			allowedBlocks: [ ROW ],
			templateLock: 'all',
			renderAppender: false
		} );

		var inspector = el( BE.InspectorControls, null,
			el( C.PanelBody, { title: __( 'Content', 'marquezy' ) },
				el( Segmented, {
					label: __( 'Source', 'marquezy' ),
					value: a.mode,
					options: [
						{ label: __( 'Own rows', 'marquezy' ), value: 'custom' },
						{ label: __( 'Global bar', 'marquezy' ), value: 'global' }
					],
					onChange: function ( v ) { set( { mode: v } ); }
				} ),
				isGlobal && el( 'p', { className: 'marquezy-inspector-note' },
					__( 'Phrases, colors, speed and separator come from the global bar.', 'marquezy' ), ' ',
					el( 'a', { href: DATA.settingsUrl, target: '_blank', rel: 'noopener noreferrer' }, __( 'Edit global bar', 'marquezy' ) ) ) ),

			el( C.PanelBody, { title: __( 'Layout', 'marquezy' ) },
				el( Segmented, {
					label: __( 'Layout', 'marquezy' ),
					value: layout,
					options: [
						{ label: __( 'Straight', 'marquezy' ), value: 'straight' },
						{ label: __( 'Tilted', 'marquezy' ), value: 'tilt' }
					].concat( isGlobal ? [] : [ { label: __( 'Crossed', 'marquezy' ), value: 'cross' } ] ),
					onChange: function ( v ) {
						set( { layout: v } );
						if ( v === 'cross' && rows.length !== 2 ) setRowCount( 2 );
					}
				} ),
				tilted && el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Angle (°)', 'marquezy' ),
					value: a.angle, min: -10, max: 10, step: 0.5,
					allowReset: true, resetFallbackValue: 4,
					onChange: function ( v ) { set( { angle: typeof v === 'number' ? v : 4 } ); }
				} ) ),
				layout === 'cross' && el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Crossing point (%)', 'marquezy' ),
					help: __( 'Where the rows intersect: negative — to the left, positive — to the right of the center.', 'marquezy' ),
					value: a.crossPoint, min: -40, max: 40, step: 1,
					allowReset: true, resetFallbackValue: 0,
					onChange: function ( v ) { set( { crossPoint: typeof v === 'number' ? v : 0 } ); }
				} ) ),
				! isGlobal && el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Number of rows', 'marquezy' ),
					help: a.layout === 'cross' ? __( 'Crossing always uses two rows.', 'marquezy' ) : undefined,
					value: rows.length || 1, min: 1, max: 3,
					disabled: a.layout === 'cross',
					onChange: function ( v ) { if ( v ) setRowCount( v ); }
				} ) ),
				! isGlobal && a.layout !== 'cross' && rows.length > 1 && el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Space between rows (px)', 'marquezy' ),
					value: a.rowGap, min: 0, max: 80,
					allowReset: true, resetFallbackValue: 0,
					onChange: function ( v ) { set( { rowGap: typeof v === 'number' ? v : 0 } ); }
				} ) ) ),

			! isGlobal && el( C.PanelBody, { title: __( 'Animation', 'marquezy' ) },
				el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Speed (px/s)', 'marquezy' ),
					value: a.speed, min: 10, max: 300, step: 5,
					allowReset: true, resetFallbackValue: 60,
					onChange: function ( v ) { set( { speed: typeof v === 'number' ? v : 60 } ); }
				} ) ),
				el( C.ToggleControl, {
					__nextHasNoMarginBottom: true,
					label: __( 'Pause on hover', 'marquezy' ),
					checked: !! a.pauseOnHover,
					onChange: function ( v ) { set( { pauseOnHover: v } ); }
				} ) ) );

		var toolbar = el( BE.BlockControls, { group: 'block' },
			el( C.ToolbarGroup, null,
				el( C.ToolbarButton, {
					icon: paused[ 0 ] ? 'controls-play' : 'controls-pause',
					label: paused[ 0 ] ? __( 'Play preview animation', 'marquezy' ) : __( 'Pause preview animation', 'marquezy' ),
					isPressed: paused[ 0 ],
					onClick: function () { paused[ 1 ]( ! paused[ 0 ] ); }
				} ) ) );

		var body = isGlobal
			? el( GlobalPreview, { attributes: a, paused: paused[ 0 ] } )
			: el( Fragment, null,
				el( LivePreview, { html: blockPreviewHtml( a, rows ), paused: paused[ 0 ] } ),
				el( 'div', { className: 'marquezy-block marquezy-block--straight is-editing', hidden: ! editing },
					el( 'div', { className: 'marquezy-stage' }, el( 'div', innerProps ) ) ) );

		return el( Fragment, null, inspector, toolbar, el( 'div', blockProps, body ) );
	}

	/* ═══════════════════════════════════════
	 * Marquee row
	 * ═══════════════════════════════════════ */
	function shadowCss( a ) {
		if ( ! a.shadow ) return undefined;
		return a.shadowX + 'px ' + a.shadowY + 'px ' + a.shadowBlur + 'px ' + a.shadowSpread + 'px ' + ( a.shadowColor || 'rgba(0, 0, 0, 0.35)' );
	}

	function RowEdit( props ) {
		var a        = props.attributes;
		var set      = props.setAttributes;
		var clientId = props.clientId;

		// Stable selector result (a number).
		var index = useSelect( function ( select ) { return select( 'core/block-editor' ).getBlockIndex( clientId ); }, [ clientId ] );
		var separator = a.separator || 'star';

		var blockProps = BE.useBlockProps( { className: 'marquezy-row marquezy-row--' + a.direction + ' is-editing' } );
		var innerProps = BE.useInnerBlocksProps( { className: 'marquezy-row__phrases' }, {
			allowedBlocks: [ 'core/paragraph' ],
			template: [ [ 'core/paragraph', { placeholder: __( 'Phrase…', 'marquezy' ) } ] ],
			templateLock: false
		} );

		var dirLabel = a.direction === 'right' ? __( '→ right', 'marquezy' ) : __( '← left', 'marquezy' );

		var inspector = el( BE.InspectorControls, null,
			el( C.PanelBody, { title: __( 'Direction', 'marquezy' ) },
				el( Segmented, {
					label: __( 'Moves', 'marquezy' ),
					value: a.direction,
					options: [
						{ value: 'left', label: __( 'Left', 'marquezy' ), iconBefore: 'arrow-left-alt' },
						{ value: 'right', label: __( 'Right', 'marquezy' ), iconAfter: 'arrow-right-alt' }
					],
					onChange: function ( v ) { set( { direction: v } ); }
				} ) ),
			el( C.PanelBody, { title: __( 'Separator', 'marquezy' ), initialOpen: false },
				el( SeparatorPicker, { value: separator, onChange: function ( v ) { set( { separator: v } ); } } ),
				el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Space around (px)', 'marquezy' ),
					value: a.gap, min: 0, max: 200,
					allowReset: true, resetFallbackValue: 32,
					onChange: function ( v ) { set( { gap: typeof v === 'number' ? v : 32 } ); }
				} ) ),
				separator !== 'none' && el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Size (px)', 'marquezy' ),
					value: a.separatorSize, min: 8, max: 64,
					allowReset: true, resetFallbackValue: 16,
					onChange: function ( v ) { set( { separatorSize: typeof v === 'number' ? v : 16 } ); }
				} ) ) ),
			separator !== 'none' && el( BE.PanelColorSettings, {
				title: __( 'Separator color', 'marquezy' ),
				initialOpen: false,
				enableAlpha: true,
				colorSettings: [ {
					label: __( 'Separator', 'marquezy' ),
					value: a.separatorColor || undefined,
					onChange: function ( v ) { set( { separatorColor: v || '' } ); }
				} ]
			} ),
			el( C.PanelBody, { title: __( 'Shadow', 'marquezy' ), initialOpen: !! a.shadow },
				el( C.ToggleControl, {
					__nextHasNoMarginBottom: true,
					label: __( 'Drop shadow', 'marquezy' ),
					checked: !! a.shadow,
					onChange: function ( v ) { set( { shadow: v } ); }
				} ),
				a.shadow && el( Fragment, null,
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Horizontal offset (px)', 'marquezy' ), value: a.shadowX, min: -60, max: 60, allowReset: true, resetFallbackValue: 0, onChange: function ( v ) { set( { shadowX: typeof v === 'number' ? v : 0 } ); } } ) ),
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Vertical offset (px)', 'marquezy' ), value: a.shadowY, min: -60, max: 60, allowReset: true, resetFallbackValue: 8, onChange: function ( v ) { set( { shadowY: typeof v === 'number' ? v : 8 } ); } } ) ),
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Blur (px)', 'marquezy' ), value: a.shadowBlur, min: 0, max: 120, allowReset: true, resetFallbackValue: 24, onChange: function ( v ) { set( { shadowBlur: typeof v === 'number' ? v : 24 } ); } } ) ),
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Spread (px)', 'marquezy' ), value: a.shadowSpread, min: -40, max: 40, allowReset: true, resetFallbackValue: 0, onChange: function ( v ) { set( { shadowSpread: typeof v === 'number' ? v : 0 } ); } } ) ) ) ),
			a.shadow && el( BE.PanelColorSettings, {
				title: __( 'Shadow color', 'marquezy' ),
				enableAlpha: true,
				colorSettings: [ {
					label: __( 'Shadow', 'marquezy' ),
					value: a.shadowColor,
					onChange: function ( v ) { set( { shadowColor: v || 'rgba(0, 0, 0, 0.35)' } ); }
				} ]
			} ) );

		var toolbar = el( BE.BlockControls, { group: 'block' },
			el( C.ToolbarGroup, null,
				el( C.ToolbarButton, {
					icon: a.direction === 'right' ? 'arrow-right-alt' : 'arrow-left-alt',
					label: __( 'Toggle direction', 'marquezy' ),
					onClick: function () { set( { direction: a.direction === 'right' ? 'left' : 'right' } ); }
				} ) ) );

		return el( Fragment, null, inspector, toolbar,
			el( 'div', Object.assign( {}, blockProps, { key: 'edit' } ),
				el( 'div', { className: 'marquezy-row__label', contentEditable: false },
					sprintf(
						/* translators: %d: row number */
						__( 'Row %d', 'marquezy' ), index + 1 ), el( 'span', { className: 'marquezy-row__dir' }, dirLabel ) ),
				el( 'div', innerProps ) ) );
	}

	/* ═══ Registration (metadata comes from block.json on the server) ═══ */
	wp.blocks.registerBlockType( PARENT, {
		icon: ICON_MARQUEE,
		edit: MarqueeEdit,
		save: function () { return el( BE.InnerBlocks.Content ); }
	} );
	wp.blocks.registerBlockType( ROW, {
		icon: ICON_ROW,
		edit: RowEdit,
		save: function () { return el( BE.InnerBlocks.Content ); }
	} );
} )( window.wp );
