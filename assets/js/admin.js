/**
 * Marquezy — Settings page
 * React app via wp.element + wp.components. No JSX, no build step.
 * Saved through the REST settings endpoint (/wp/v2/settings).
 *
 * Phrases: a numbered list. Every phrase is its own row with its own mini block editor
 * (one "phrase" block → native bold / italic / link toolbar with page search).
 * Enter adds the next phrase, Backspace in an empty phrase removes it.
 */
( function ( wp, data ) {
	'use strict';

	if ( ! data || ! document.getElementById( 'marquezy-admin-root' ) ) return;

	var el        = wp.element.createElement;
	var Fragment  = wp.element.Fragment;
	var useState  = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useLayoutEffect = wp.element.useLayoutEffect;
	var useRef    = wp.element.useRef;
	var C         = wp.components;
	var BE        = wp.blockEditor;
	var __        = wp.i18n.__;
	var sprintf   = wp.i18n.sprintf;
	var decode    = wp.htmlEntities.decodeEntities;
	var PHRASE    = 'marquezy/phrase';
	var FORMATS   = [ 'core/bold', 'core/italic', 'core/link' ];
	var CTRL      = { __nextHasNoMarginBottom: true, __next40pxDefaultSize: true };

	/* ═══════════════════════════════════════
	 * Phrase block (settings page only): one line, no splitting — rows handle Enter.
	 * ═══════════════════════════════════════ */
	if ( ! wp.blocks.getBlockType( PHRASE ) ) {
		wp.blocks.registerBlockType( PHRASE, {
			apiVersion: 3,
			title: __( 'Phrase', 'marquezy' ),
			category: 'text',
			icon: 'megaphone',
			attributes: { content: { type: 'string', default: '' } },
			supports: { html: false, reusable: false, className: false, customClassName: false, lock: false },
			edit: function ( props ) {
				var blockProps = BE.useBlockProps( { className: 'marquezy-phrase' } );
				return el( BE.RichText, Object.assign( {}, blockProps, {
					identifier: 'content',
					tagName: 'div',
					value: props.attributes.content,
					onChange: function ( value ) { props.setAttributes( { content: value } ); },
					disableLineBreaks: true,
					allowedFormats: FORMATS,
					placeholder: __( 'Type the phrase…', 'marquezy' ),
					'aria-label': __( 'Phrase text', 'marquezy' )
				} ) );
			},
			save: function () { return null; }
		} );
	}

	// Link search inside the link popover (feature-detected: experimental API, degrades to URL-only).
	var fetchLinkSuggestions = wp.coreData && typeof wp.coreData.__experimentalFetchLinkSuggestions === 'function'
		? function ( search, options ) { return wp.coreData.__experimentalFetchLinkSuggestions( search, options, {} ); }
		: undefined;

	var EDITOR_SETTINGS = {
		allowedBlockTypes: [ PHRASE ],
		hasFixedToolbar: true,
		codeEditingEnabled: false,
		canLockBlocks: false,
		__experimentalFetchLinkSuggestions: fetchLinkSuggestions
	};

	function hasText( html ) {
		var div = document.createElement( 'div' );
		div.innerHTML = html;
		return div.textContent.replace( / /g, '' ).trim() !== '';
	}

	var uid = 0;
	function newRow( html ) { uid += 1; return { id: 'p' + uid, html: html || '' }; }

	/* ═══════════════════════════════════════
	 * Phrase row
	 * ═══════════════════════════════════════ */

	// Lives inside a row's BlockEditorProvider: exposes that row's own selection actions.
	function RowBridge( props ) {
		var d = wp.data.useDispatch( 'core/block-editor' );
		props.api.current = { clear: d.clearSelectedBlock, select: d.selectBlock };
		return null;
	}

	function PhraseRow( props ) {
		var ref        = useRef();
		var api        = useRef( {} );
		var blockState = useState( function () { return [ wp.blocks.createBlock( PHRASE, { content: props.html } ) ]; } );
		var blocks     = blockState[ 0 ], setBlocks = blockState[ 1 ];
		var Tools      = BE.BlockTools || Fragment;

		function onBlocks( next ) {
			if ( ! next.length ) next = [ wp.blocks.createBlock( PHRASE ) ]; // never leave the row empty
			setBlocks( next );
			props.onChange( String( next[ 0 ].attributes.content || '' ) );
		}

		// Focus synchronously after mount (before the next keystroke), retry once the editable exists.
		useLayoutEffect( function () {
			if ( ! props.autoFocus || ! ref.current ) return;
			var frame = 0;
			function focus() {
				var editable = ref.current && ref.current.querySelector( '[contenteditable="true"]' );
				if ( editable ) editable.focus();
				else frame = requestAnimationFrame( focus );
			}
			if ( api.current.select ) api.current.select( blocks[ 0 ].clientId );
			focus();
			return function () { cancelAnimationFrame( frame ); };
		}, [ props.autoFocus ] );

		function onKeyDown( e ) {
			if ( ! e.target.isContentEditable || e.nativeEvent.isComposing ) return;
			if ( e.key === 'Enter' && ! e.shiftKey ) {
				e.preventDefault();
				// Release this row first, otherwise its editor may pull the focus back.
				if ( api.current.clear ) api.current.clear();
				e.target.blur();
				props.onEnter();
			} else if ( e.key === 'Backspace' && ! hasText( props.html ) && props.total > 1 ) {
				e.preventDefault();
				props.onRemove( true );
			}
		}

		var n = props.index + 1;
		return el( 'div', {
				ref: ref,
				className: 'marquezy-phrase-row' + ( props.active ? ' is-active' : '' ),
				onFocus: props.onFocus,
				onKeyDown: onKeyDown
			},
			// Own SlotFillProvider per row: toolbar fills of one row never leak into another row's toolbar.
			el( C.SlotFillProvider, null,
			el( BE.BlockEditorProvider, { value: blocks, onInput: onBlocks, onChange: onBlocks, settings: EDITOR_SETTINGS },
				el( RowBridge, { api: api } ),
				el( 'div', { className: 'marquezy-phrase-row__head' },
					el( 'span', { className: 'marquezy-phrase-row__num', 'aria-hidden': true }, n ),
					el( 'span', { className: 'marquezy-phrase-row__title' }, sprintf(
						/* translators: %d: phrase number */
						__( 'Phrase %d', 'marquezy' ), n ) ),
					el( 'div', { className: 'marquezy-phrase-row__toolbar' }, props.active && BE.BlockToolbar ? el( BE.BlockToolbar, { hideDragHandle: true } ) : null ),
					el( 'div', { className: 'marquezy-phrase-row__actions' },
						el( C.Button, { icon: 'arrow-up-alt2', label: __( 'Move up', 'marquezy' ), size: 'small', disabled: props.index === 0, onClick: function () { props.onMove( -1 ); } } ),
						el( C.Button, { icon: 'arrow-down-alt2', label: __( 'Move down', 'marquezy' ), size: 'small', disabled: props.index === props.total - 1, onClick: function () { props.onMove( 1 ); } } ),
						el( C.Button, { icon: 'trash', label: __( 'Remove phrase', 'marquezy' ), size: 'small', isDestructive: true, disabled: props.total < 2 && ! hasText( props.html ), onClick: function () { props.onRemove( false ); } } ) ) ),
				el( 'div', { className: 'marquezy-phrase-row__field' },
					el( Tools, null, el( BE.WritingFlow, null, el( BE.ObserveTyping, null, el( BE.BlockList, { renderAppender: false } ) ) ) ) ) ),
			el( C.Popover.Slot ) ) );
	}

	function PhraseList( props ) {
		var rows       = props.rows;
		var activeSt   = useState( null );
		var active     = activeSt[ 0 ], setActive = activeSt[ 1 ];
		var focusSt    = useState( null );
		var focusReq   = focusSt[ 0 ], setFocusReq = focusSt[ 1 ];
		// A counter per request: focusing the same row twice in a row still triggers its effect.
		function setFocusId( id ) { setFocusReq( id ? { id: id, n: Date.now() + Math.random() } : null ); }

		function update( next ) { props.onChange( next ); }

		function insertAfter( index ) {
			var row  = newRow( '' );
			var next = rows.slice();
			next.splice( index + 1, 0, row );
			update( next );
			setFocusId( row.id );
		}

		function remove( index, focusPrev ) {
			var next = rows.slice();
			next.splice( index, 1 );
			if ( ! next.length ) next = [ newRow( '' ) ];
			update( next );
			setFocusId( focusPrev && next[ Math.max( 0, index - 1 ) ] ? next[ Math.max( 0, index - 1 ) ].id : null );
		}

		function move( index, dir ) {
			var to = index + dir;
			if ( to < 0 || to >= rows.length ) return;
			var next = rows.slice();
			var item = next.splice( index, 1 )[ 0 ];
			next.splice( to, 0, item );
			update( next );
		}

		return el( 'div', { className: 'marquezy-phrase-list' },
			rows.map( function ( row, i ) {
				return el( PhraseRow, {
					key: row.id,
					index: i,
					total: rows.length,
					html: row.html,
					active: active === row.id,
					autoFocus: focusReq && focusReq.id === row.id ? focusReq.n : 0,
					onFocus: function () { setActive( row.id ); },
					onChange: function ( html ) {
						update( rows.map( function ( r ) { return r.id === row.id ? { id: r.id, html: html } : r; } ) );
					},
					onEnter: function () { insertAfter( i ); },
					onRemove: function ( focusPrev ) { remove( i, focusPrev ); },
					onMove: function ( dir ) { move( i, dir ); }
				} );
			} ),
			el( C.Button, { variant: 'secondary', icon: 'plus-alt2', className: 'marquezy-add-phrase', onClick: function () { insertAfter( rows.length - 1 ); } },
				__( 'Add phrase', 'marquezy' ) ) );
	}

	/* ═══════════════════════════════════════
	 * Entity picker (pages & posts / terms) — search, results list, selected list
	 * ═══════════════════════════════════════ */
	var postTypeLabels = {};
	data.postTypes.forEach( function ( pt ) { postTypeLabels[ pt.slug ] = pt.singular; } );

	function toItem( kind, r ) {
		return kind === 'term'
			? { id: r.id, title: decode( r.title || '' ), meta: data.taxonomies[ r.type ] || r.type }
			: { id: r.id, title: decode( r.title || __( '(no title)', 'marquezy' ) ), meta: postTypeLabels[ r.subtype ] || r.subtype };
	}

	function EntityPicker( props ) {
		var wrap      = useRef();
		var timer     = useRef( 0 );
		var reqId     = useRef( 0 );
		var qSt       = useState( '' );
		var query     = qSt[ 0 ], setQuery = qSt[ 1 ];
		var rSt       = useState( [] );
		var results   = rSt[ 0 ], setResults = rSt[ 1 ];
		var oSt       = useState( false );
		var open      = oSt[ 0 ], setOpen = oSt[ 1 ];
		var lSt       = useState( false );
		var loading   = lSt[ 0 ], setLoading = lSt[ 1 ];
		var selectedIds = props.items.map( function ( i ) { return i.id; } );

		function run( text ) {
			clearTimeout( timer.current );
			timer.current = setTimeout( function () {
				var current = ++reqId.current;
				setLoading( true );
				wp.apiFetch( {
					path: wp.url.addQueryArgs( '/wp/v2/search', { search: text, type: props.kind, subtype: 'any', per_page: 12 } )
				} ).then( function ( res ) {
					if ( current !== reqId.current ) return; // a newer search is running
					setResults( res.map( function ( r ) { return toItem( props.kind, r ); } ) );
				} ).catch( function () {
					if ( current === reqId.current ) setResults( [] );
				} ).finally( function () {
					if ( current === reqId.current ) setLoading( false );
				} );
			}, text ? 250 : 0 );
		}

		// Close on outside click / Escape.
		useEffect( function () {
			if ( ! open ) return;
			function onDown( e ) { if ( wrap.current && ! wrap.current.contains( e.target ) ) setOpen( false ); }
			function onKey( e ) { if ( e.key === 'Escape' ) setOpen( false ); }
			document.addEventListener( 'mousedown', onDown );
			document.addEventListener( 'keydown', onKey );
			return function () {
				document.removeEventListener( 'mousedown', onDown );
				document.removeEventListener( 'keydown', onKey );
			};
		}, [ open ] );

		function openList() {
			if ( ! open ) { setOpen( true ); if ( ! results.length ) run( query ); }
		}

		function toggle( item ) {
			if ( selectedIds.indexOf( item.id ) !== -1 ) {
				props.onChange( props.items.filter( function ( i ) { return i.id !== item.id; } ) );
			} else {
				props.onChange( props.items.concat( [ item ] ) );
			}
		}

		var list = null;
		if ( open ) {
			var body;
			if ( loading && ! results.length ) {
				body = el( 'div', { className: 'marquezy-picker__state' }, el( C.Spinner ) );
			} else if ( ! results.length ) {
				body = el( 'div', { className: 'marquezy-picker__state' }, __( 'Nothing found.', 'marquezy' ) );
			} else {
				body = results.map( function ( item ) {
					var on = selectedIds.indexOf( item.id ) !== -1;
					return el( 'button', {
							key: item.id,
							type: 'button',
							role: 'option',
							'aria-selected': on,
							className: 'marquezy-picker__option' + ( on ? ' is-selected' : '' ),
							onClick: function () { toggle( item ); }
						},
						el( 'span', { className: 'marquezy-picker__check', 'aria-hidden': true }, on ? '✓' : '' ),
						el( 'span', { className: 'marquezy-picker__title' }, item.title ),
						el( 'span', { className: 'marquezy-picker__meta' }, item.meta ) );
				} );
			}
			list = el( 'div', { className: 'marquezy-picker__results', role: 'listbox', 'aria-multiselectable': true }, body );
		}

		return el( 'div', { className: 'marquezy-picker', ref: wrap },
			el( 'div', { className: 'marquezy-picker__label' }, props.label ),
			el( 'div', { className: 'marquezy-picker__search', onFocus: openList, onClick: openList },
				el( C.SearchControl, {
					__nextHasNoMarginBottom: true,
					label: props.label,
					hideLabelFromVision: true,
					placeholder: props.placeholder,
					value: query,
					onChange: function ( v ) { setQuery( v ); setOpen( true ); run( v ); }
				} ),
				list ),
			props.items.length
				? el( 'ul', { className: 'marquezy-picker__selected' },
					props.items.map( function ( item ) {
						return el( 'li', { key: item.id },
							el( 'span', { className: 'marquezy-picker__title' }, item.title ),
							el( 'span', { className: 'marquezy-picker__meta' }, item.meta ),
							el( C.Button, {
								icon: 'no-alt',
								size: 'small',
								label: sprintf(
									/* translators: %s: page, post or term title */
									__( 'Remove %s', 'marquezy' ), item.title ),
								onClick: function () { toggle( item ); }
							} ) );
					} ) )
				: el( 'p', { className: 'marquezy-picker__empty' }, props.emptyText ) );
	}

	/* ═══════════════════════════════════════
	 * Small building blocks
	 * ═══════════════════════════════════════ */
	function Section( props ) {
		return el( C.Card, { className: 'marquezy-card', size: 'medium' },
			el( C.CardHeader, null,
				el( 'div', null,
					el( 'h2', { className: 'marquezy-card__title' }, props.title ),
					props.subtitle ? el( 'p', { className: 'marquezy-card__subtitle' }, props.subtitle ) : null ),
				props.aside || null ),
			el( C.CardBody, { className: 'marquezy-card__body' }, props.children ) );
	}

	function Grid( props ) {
		return el( 'div', { className: 'marquezy-grid marquezy-grid--' + ( props.columns || 2 ) }, props.children );
	}

	/* Compact color list (like the editor's color panel): swatch + label + value, palette in a popover */
	function ColorList( props ) {
		return el( 'div', { className: 'marquezy-color-list' + ( props.className ? ' ' + props.className : '' ) },
			props.label ? el( 'div', { className: 'marquezy-control-label' }, props.label ) : null,
			el( 'div', { className: 'marquezy-color-list__items' },
				props.items.map( function ( it ) {
					return el( C.Dropdown, {
						key: it.key,
						className: 'marquezy-color-item',
						popoverProps: { placement: 'left-start', offset: 36, shift: true },
						renderToggle: function ( t ) {
							return el( C.Button, { className: 'marquezy-color-item__toggle', onClick: t.onToggle, 'aria-expanded': t.isOpen },
								el( C.ColorIndicator, { colorValue: it.value || it.fallback } ),
								el( 'span', { className: 'marquezy-color-item__label' }, it.label ),
								el( 'span', { className: 'marquezy-color-item__value' }, it.value || it.emptyLabel || '' ) );
						},
						renderContent: function () {
							return el( 'div', { className: 'marquezy-color-popover' },
								el( C.ColorPalette, {
									colors: data.palettes,
									value: it.value,
									enableAlpha: true,
									clearable: true,
									onChange: function ( v ) { it.onChange( v || it.resetTo || '' ); }
								} ) );
						}
					} );
				} ) ) );
	}

	/* Segmented control: one line of buttons, one active */
	function Segmented( props ) {
		return el( 'div', { className: 'marquezy-seg-control' },
			props.label ? el( 'div', { className: 'marquezy-control-label', id: props.id + '-label' }, props.label ) : null,
			el( 'div', { className: 'marquezy-seg', role: 'radiogroup', 'aria-labelledby': props.label ? props.id + '-label' : undefined },
				props.options.map( function ( o ) {
					var on = o.value === props.value;
					return el( 'button', {
							key: o.value,
							type: 'button',
							role: 'radio',
							'aria-checked': on,
							className: 'marquezy-seg__btn' + ( on ? ' is-active' : '' ),
							onClick: function () { props.onChange( o.value ); }
						},
						o.iconBefore ? el( C.Dashicon, { icon: o.iconBefore } ) : null,
						el( 'span', null, o.label ),
						o.iconAfter ? el( C.Dashicon, { icon: o.iconAfter } ) : null );
				} ) ),
			props.help ? el( 'p', { className: 'marquezy-control-help' }, props.help ) : null );
	}

	function DirectionControl( props ) {
		return el( Segmented, {
			id: props.id,
			label: __( 'Direction', 'marquezy' ),
			value: props.value,
			onChange: props.onChange,
			options: [
				{ value: 'left', label: __( 'Left', 'marquezy' ), iconBefore: 'arrow-left-alt' },
				{ value: 'right', label: __( 'Right', 'marquezy' ), iconAfter: 'arrow-right-alt' }
			]
		} );
	}

	function LayoutControl( props ) {
		return el( Segmented, {
			id: 'marquezy-layout-' + ( props.id || 'x' ),
			label: __( 'Layout', 'marquezy' ),
			value: props.value,
			onChange: props.onChange,
			options: [
				{ value: 'straight', label: __( 'Straight', 'marquezy' ) },
				{ value: 'tilt', label: __( 'Tilted', 'marquezy' ) },
				{ value: 'cross', label: __( 'Crossed', 'marquezy' ) }
			]
		} );
	}

	var SEP_ICONS = {
		bar: el( 'svg', { width: 3, height: 16, viewBox: '0 0 2 16', fill: 'currentColor', 'aria-hidden': true }, el( 'rect', { width: 2, height: 16, rx: 1 } ) ),
		dot: el( 'svg', { width: 7, height: 7, viewBox: '0 0 10 10', fill: 'currentColor', 'aria-hidden': true }, el( 'circle', { cx: 5, cy: 5, r: 5 } ) ),
		dash: el( 'svg', { width: 16, height: 3, viewBox: '0 0 16 2', fill: 'currentColor', 'aria-hidden': true }, el( 'rect', { width: 16, height: 2, rx: 1 } ) ),
		star: el( 'svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
			el( 'polygon', { points: '12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26' } ) ),
		diamond: el( 'svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
			el( 'polygon', { points: '12,2 22,12 12,22 2,12' } ) ),
		asterisk: el( 'svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
			el( 'path', { d: 'M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2Z' } ) )
	};
	var SEP_LABELS = {
		none: __( 'None', 'marquezy' ), star: __( 'Star', 'marquezy' ), asterisk: __( '4-point star', 'marquezy' ),
		diamond: __( 'Diamond', 'marquezy' ), dot: __( 'Dot', 'marquezy' ), bar: __( 'Bar', 'marquezy' ), dash: __( 'Dash', 'marquezy' )
	};

	/* Icon-only separator picker; the name shows as a tooltip */
	function SeparatorPicker( props ) {
		return el( 'div', { className: 'marquezy-sep-control' },
			el( 'div', { className: 'marquezy-control-label' }, __( 'Separator', 'marquezy' ),
				el( 'span', { className: 'marquezy-control-label__value' }, SEP_LABELS[ props.value ] ) ),
			el( 'div', { className: 'marquezy-sep-picker', role: 'radiogroup', 'aria-label': __( 'Separator', 'marquezy' ) },
				Object.keys( SEP_LABELS ).map( function ( key ) {
					var active = props.value === key;
					return el( C.Button, {
						key: key,
						className: 'marquezy-sep-option' + ( active ? ' is-active' : '' ),
						role: 'radio',
						'aria-checked': active,
						label: SEP_LABELS[ key ],
						showTooltip: true,
						onClick: function () { props.onChange( key ); }
					}, SEP_ICONS[ key ] || el( 'span', { className: 'marquezy-sep-glyph is-none', 'aria-hidden': true }, '∅' ) );
				} ) ) );
	}

	/* Two-column editor layout: main content + collapsible settings sidebar */
	function EditorLayout( props ) {
		return el( 'div', { className: 'marquezy-layout' },
			el( 'div', { className: 'marquezy-layout__main' }, props.main ),
			el( 'aside', { className: 'marquezy-layout__side', 'aria-label': __( 'Settings', 'marquezy' ) },
				el( C.Panel, { className: 'marquezy-side-panel' }, props.side ) ) );
	}

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

	function LivePreview( props ) {
		var paused = usePreviewPaused();
		var ref = useRef();
		useEffect( function () {
			if ( ! ref.current || ! window.marquezy ) return;
			var destroyers = [];
			ref.current.querySelectorAll( '.marquezy-loop' ).forEach( function ( loop ) {
				destroyers.push( window.marquezy.initLoop( loop ) );
			} );
			return function () { while ( destroyers.length ) destroyers.pop()(); };
		}, [ props.html ] );
		return el( 'div', { className: 'marquezy-sc-preview' + ( paused[ 0 ] ? ' marquezy-preview-paused' : '' ) },
			el( 'div', { className: 'marquezy-sc-preview__label' }, __( 'Live preview', 'marquezy' ),
				el( 'div', { className: 'marquezy-sc-preview__tools' },
					el( 'span', null, __( 'On the site the text uses your theme fonts.', 'marquezy' ) ),
					el( C.Button, {
						size: 'small',
						icon: paused[ 0 ] ? 'controls-play' : 'controls-pause',
						label: paused[ 0 ] ? __( 'Play preview animation', 'marquezy' ) : __( 'Pause preview animation', 'marquezy' ),
						showTooltip: true,
						isPressed: paused[ 0 ],
						onClick: function () { paused[ 1 ]( ! paused[ 0 ] ); }
					} ) ) ),
			props.html
				? el( 'div', { ref: ref, className: 'marquezy-sc-preview__stage' + ( props.flush ? ' is-flush' : '' ), key: props.html, dangerouslySetInnerHTML: { __html: props.html } } )
				: el( 'div', { className: 'marquezy-sc-preview__empty' }, props.emptyText ) );
	}

	function CheckboxGroup( props ) {
		return el( C.BaseControl, { __nextHasNoMarginBottom: true, label: props.label, id: props.id, help: props.help },
			el( 'div', { className: 'marquezy-checkbox-grid', id: props.id },
				props.options.map( function ( o ) {
					var checked = props.value.indexOf( o.value ) !== -1;
					return el( C.CheckboxControl, {
						key: o.value,
						__nextHasNoMarginBottom: true,
						label: o.label,
						checked: checked,
						onChange: function ( on ) {
							var list = props.value.filter( function ( v ) { return v !== o.value; } );
							if ( on ) list.push( o.value );
							props.onChange( list );
						}
					} );
				} ) ) );
	}

	/* ═══════════════════════════════════════
	 * App
	 * ═══════════════════════════════════════ */
	var STICKY_HELP = {
		scroll: __( 'Sits below the header and scrolls away with the content.', 'marquezy' ),
		always: __( 'Stays on screen (sticky). Sits below a sticky header if there is one.', 'marquezy' ),
		smart: __( 'Sticks when scrolled past; follows a header that hides on scroll.', 'marquezy' )
	};
	var MODE_HELP = {
		all: __( 'The bar appears below the header on every page.', 'marquezy' ),
		include: __( 'The bar appears only where at least one of the conditions below matches.', 'marquezy' ),
		exclude: __( 'The bar appears everywhere except where one of the conditions below matches.', 'marquezy' ),
		manual: __( 'Nothing is added automatically. Place it yourself: the “Marquee” block (source: Global bar) or the shortcode [marquezy] in a page builder.', 'marquezy' )
	};
	var SPECIAL_OPTIONS = [
		{ value: 'front', label: __( 'Front page', 'marquezy' ) },
		{ value: 'blog', label: __( 'Blog (posts page)', 'marquezy' ) },
		{ value: 'archive', label: __( 'Archives', 'marquezy' ) },
		{ value: 'search', label: __( 'Search results', 'marquezy' ) },
		{ value: '404', label: __( '404 page', 'marquezy' ) }
	];

	/* ═══════════════════════════════════════
	 * Shortcode builder
	 * Preview markup mirrors PHP marquezy_layout_html() + marquezy_render_shortcode_row();
	 * it is animated by the front-end loop (window.marquezy.initLoop).
	 * ═══════════════════════════════════════ */
	var SEP_HTML = {
		bar: '<svg xmlns="http://www.w3.org/2000/svg" width="0.12em" height="1em" viewBox="0 0 2 16" fill="currentColor" focusable="false"><rect width="2" height="16" rx="1"/></svg>',
		dot: '<svg xmlns="http://www.w3.org/2000/svg" width="0.4em" height="0.4em" viewBox="0 0 10 10" fill="currentColor" focusable="false"><circle cx="5" cy="5" r="5"/></svg>',
		dash: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="0.12em" viewBox="0 0 16 2" fill="currentColor" focusable="false"><rect width="16" height="2" rx="1"/></svg>',
		star: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>',
		diamond: '<svg xmlns="http://www.w3.org/2000/svg" width="0.8em" height="0.8em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><polygon points="12,2 22,12 12,22 2,12"/></svg>',
		asterisk: '<svg xmlns="http://www.w3.org/2000/svg" width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="currentColor" focusable="false"><path d="M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2Z"/></svg>'
	};

	function escAttr( v ) {
		return String( v ).replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
	}

	// Same rules as PHP marquezy_sanitize_color() — the preview never shows a color the site would drop.
	var COLOR_ARG = '[a-z0-9.%\\s,\\/+#-]*';
	var COLOR_FN  = new RegExp( '^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\\(' + COLOR_ARG + '(?:[a-z-]*\\(' + COLOR_ARG + '\\)' + COLOR_ARG + ')*\\)$', 'i' );
	function cleanColor( v ) {
		v = String( v || '' ).trim();
		if ( /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test( v ) ) return v;
		if ( /^[a-z]{3,30}$/i.test( v ) ) return v;
		if ( /^var\(--wp--preset--color--[a-z0-9-]+\)$/i.test( v ) ) return v;
		return COLOR_FN.test( v ) ? v : '';
	}
	// Same as PHP marquezy_flatten_html().
	function flatten( html ) {
		return String( html ).replace( /<\/?(div|p)\b[^>]*>/gi, '' ).replace( /<br\s*\/?\s*>/gi, ' ' ).replace( /\s+/g, ' ' ).trim();
	}

	function sepHtml( key ) {
		return SEP_HTML[ key ]
			? '<span class="marquezy-sep" aria-hidden="true">' + SEP_HTML[ key ] + '</span>'
			: '<span class="marquezy-sep marquezy-sep--none" aria-hidden="true"></span>';
	}

	function rowHtml( row, sc ) {
		var frames = row.phrases.map( function ( p ) { return flatten( p.html ); } ).filter( hasText );
		if ( ! frames.length ) return '';
		var sep   = row.separator || 'star';
		var style = '--marquezy-sep-size:' + row.separatorSize + 'px;--marquezy-gap:' + row.gap + 'px;';
		if ( cleanColor( row.separatorColor ) ) style += '--marquezy-sep-color:' + cleanColor( row.separatorColor ) + ';';
		if ( cleanColor( row.bg ) ) style += 'background-color:' + cleanColor( row.bg ) + ';';
		if ( cleanColor( row.text ) ) style += 'color:' + cleanColor( row.text ) + ';';
		if ( cleanColor( row.link ) ) style += '--marquezy-link:' + cleanColor( row.link ) + ';';
		if ( row.fontSize ) style += 'font-size:' + row.fontSize + 'px;';
		style += 'padding-block:' + row.padding + 'px;';
		if ( row.shadow ) {
			style += 'box-shadow:' + row.shadowX + 'px ' + row.shadowY + 'px ' + row.shadowBlur + 'px ' + row.shadowSpread + 'px ' + ( cleanColor( row.shadowColor ) || '#00000059' ) + ';';
		}
		var cycle = frames.map( function ( f ) { return '<span class="marquezy-frame">' + f + '</span>' + sepHtml( sep ); } ).join( '' );
		return '<div class="marquezy-row marquezy-row--custom marquezy-loop marquezy-row--' + row.direction + ( sc.pauseOnHover ? ' marquezy-hover-pause' : '' ) + '" style="' + escAttr( style ) + '">'
			+ '<div class="marquezy-track"><div class="marquezy-group"><div class="marquezy-cycle">' + cycle + '</div></div></div></div>';
	}

	function shortcodeHtml( sc ) {
		var max = sc.layout === 'cross' ? 2 : 3;
		var rendered = sc.rows.slice( 0, max ).map( function ( r ) { return rowHtml( r, sc ); } ).filter( Boolean );
		if ( ! rendered.length ) return '';
		var layout = sc.layout === 'cross' && rendered.length < 2 ? 'tilt' : sc.layout;
		var angle  = layout === 'straight' ? 0 : sc.angle;
		var vars   = '--marquezy-row-gap:' + sc.rowGap + 'px;';
		if ( layout === 'cross' && sc.crossPoint ) vars += '--marquezy-cross:' + sc.crossPoint + 'cqw;--marquezy-cross-abs:' + Math.abs( sc.crossPoint ) + 'cqw;';
		vars += '--marquezy-angle:' + angle + 'deg;--marquezy-angle-abs:' + Math.abs( angle ) + 'deg;';
		return '<div class="marquezy-block marquezy-block--' + layout + ' marquezy-block--shortcode" style="' + escAttr( vars ) + '" data-marquezy-speed="' + sc.speed + '" role="marquee" aria-label="' + escAttr( __( 'Announcements', 'marquezy' ) ) + '">'
			+ '<div class="marquezy-stage"><div class="marquezy-rows">' + rendered.join( '' ) + '</div></div></div>';
	}

	/* Global bar preview — mirrors PHP marquezy_get_marquee_html() (without sticky/placement). */
	var ICON_PAUSE = '<svg class="marquezy-icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg><svg class="marquezy-icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l10.4-6.5a1 1 0 0 0 0-1.74L9.5 4.63A1 1 0 0 0 8 5.5z"/></svg>';
	var ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';

	function globalBarHtml( o, phrases ) {
		var frames = phrases.map( flatten ).filter( hasText );
		if ( ! frames.length ) return '';
		var style = '--marquezy-bg:' + ( cleanColor( o.bg_color ) || '#F06A8F' ) + ';--marquezy-color:' + ( cleanColor( o.text_color ) || '#FFFFFF' ) + ';--marquezy-link:' + ( cleanColor( o.link_color ) || '#5B2A4E' ) + ';'
			+ '--marquezy-fs:' + o.font_size + 'px;--marquezy-fs-m:' + o.font_size_mobile + 'px;--marquezy-h:' + o.height + 'px;--marquezy-pv:' + o.padding_v + 'px;--marquezy-z:1;'
			+ '--marquezy-gap:' + o.gap + 'px;--marquezy-sep-size:' + o.separator_size + 'px;'
			+ ( cleanColor( o.separator_color ) ? '--marquezy-sep-color:' + cleanColor( o.separator_color ) + ';' : '' );
		var controls = ( o.pause_button ? '<button type="button" class="marquezy-control marquezy-pause" aria-pressed="false" tabindex="-1">' + ICON_PAUSE + '</button>' : '' )
			+ ( o.close_button ? '<button type="button" class="marquezy-control marquezy-close" tabindex="-1">' + ICON_CLOSE + '</button>' : '' );
		var cycle = frames.map( function ( f ) { return '<span class="marquezy-frame">' + f + '</span>' + sepHtml( o.separator ); } ).join( '' );
		return '<div class="marquezy-bar marquezy-loop marquezy-hover-pause' + ( controls ? ' marquezy-bar--has-controls' : '' ) + '" style="' + escAttr( style ) + '" data-marquezy-speed="' + o.speed + '">'
			+ '<div class="marquezy-track"><div class="marquezy-group"><div class="marquezy-cycle">' + cycle + '</div></div></div>'
			+ ( controls ? '<div class="marquezy-controls">' + controls + '</div>' : '' ) + '</div>';
	}

	/* New row: chessboard direction + preset colors (PHP marquezy_row_presets) */
	function newScRow( index ) {
		var preset = ( data.rowPresets || [] )[ index ] || {};
		return Object.assign( {}, data.shortcodeRowDefaults, {
			direction: index % 2 ? 'right' : 'left',
			bg: preset.bg || data.shortcodeRowDefaults.bg,
			text: preset.text || data.shortcodeRowDefaults.text,
			phrases: [ newRow( '' ) ]
		} );
	}

	function toEditable( sc ) {
		var out = Object.assign( {}, data.shortcodeDefaults, sc );
		out.rows = ( sc.rows || [] ).map( function ( r ) {
			var row = Object.assign( {}, data.shortcodeRowDefaults, r );
			row.phrases = ( r.phrases && r.phrases.length ? r.phrases : [ '' ] ).map( newRow );
			return row;
		} );
		if ( ! out.rows.length ) out.rows = [ newScRow( 0 ) ]; // never an editor without rows
		return out;
	}
	function toServer( sc ) {
		var out = Object.assign( {}, sc );
		out.rows = sc.rows.map( function ( r ) {
			var row = Object.assign( {}, r );
			row.phrases = r.phrases.map( function ( p ) { return p.html; } ).filter( hasText );
			return row;
		} );
		return out;
	}
	function codeFor( id ) { return '[marquezy id="' + id + '"]'; }

	function CopyCode( props ) {
		var st    = useState( false );
		var copied = st[ 0 ], setCopied = st[ 1 ];
		var timer = useRef( 0 );
		useEffect( function () { return function () { clearTimeout( timer.current ); }; }, [] );
		function done() {
			setCopied( true );
			clearTimeout( timer.current );
			timer.current = setTimeout( function () { setCopied( false ); }, 1500 );
		}
		function fallback() {
			var ta = document.createElement( 'textarea' );
			ta.value = props.text; document.body.appendChild( ta ); ta.select();
			try { if ( document.execCommand( 'copy' ) ) done(); } catch ( e ) { /* the code is selectable anyway */ }
			ta.remove();
		}
		function copy() {
			if ( navigator.clipboard && window.isSecureContext ) {
				navigator.clipboard.writeText( props.text ).then( done, fallback );
			} else {
				fallback();
			}
		}
		return el( 'div', { className: 'marquezy-code' },
			el( 'code', null, props.text ),
			el( C.Button, { variant: 'secondary', size: 'small', icon: copied ? 'yes' : 'admin-page', onClick: copy },
				copied ? __( 'Copied', 'marquezy' ) : __( 'Copy', 'marquezy' ) ) );
	}

	var LAYOUT_LABELS = {
		straight: __( 'Straight', 'marquezy' ),
		tilt: __( 'Tilted', 'marquezy' ),
		cross: __( 'Crossed', 'marquezy' )
	};

	function ShortcodeList( props ) {
		return el( Section, {
				title: __( 'Shortcodes', 'marquezy' ),
				subtitle: __( 'For page builders and the Classic editor: build a marquee here, save, and paste its shortcode anywhere. [marquezy] without an id shows the global bar.', 'marquezy' )
			},
			props.items.length
				? el( 'div', { className: 'marquezy-sc-list' },
					props.items.map( function ( sc ) {
						var phraseCount = sc.rows.reduce( function ( n, r ) { return n + r.phrases.filter( function ( p ) { return hasText( p.html ); } ).length; }, 0 );
						return el( 'div', { key: sc.id, className: 'marquezy-sc-item' },
							el( 'div', { className: 'marquezy-sc-item__main' },
								el( 'button', { type: 'button', className: 'marquezy-sc-item__name', onClick: function () { props.onEdit( sc.id ); } },
									sc.name || __( 'Untitled marquee', 'marquezy' ) ),
								el( 'span', { className: 'marquezy-sc-item__meta' },
									sprintf(
										/* translators: 1: layout name, 2: number of rows, 3: number of phrases */
										__( '%1$s · %2$d rows · %3$d phrases', 'marquezy' ), LAYOUT_LABELS[ sc.layout ], sc.layout === 'cross' ? Math.min( 2, sc.rows.length ) : sc.rows.length, phraseCount ),
									props.unsaved.indexOf( sc.id ) !== -1 ? el( 'span', { className: 'marquezy-badge' }, __( 'not saved', 'marquezy' ) ) : null ) ),
							el( CopyCode, { text: codeFor( sc.id ) } ),
							el( 'div', { className: 'marquezy-sc-item__actions' },
								el( C.Button, { variant: 'secondary', size: 'small', onClick: function () { props.onEdit( sc.id ); } }, __( 'Edit', 'marquezy' ) ),
								el( C.Button, { size: 'small', icon: 'admin-page', label: __( 'Duplicate', 'marquezy' ), onClick: function () { props.onDuplicate( sc.id ); } } ),
								el( C.Button, { size: 'small', icon: 'trash', isDestructive: true, label: __( 'Delete', 'marquezy' ), onClick: function () { props.onDelete( sc.id ); } } ) ) );
					} ) )
				: el( 'div', { className: 'marquezy-sc-empty' },
					el( 'p', null, __( 'No shortcodes yet.', 'marquezy' ) ) ),
			el( C.Button, { variant: 'primary', icon: 'plus-alt2', className: 'marquezy-sc-new', onClick: props.onCreate }, __( 'New shortcode', 'marquezy' ) ) );
	}

	function ShortcodeEditor( props ) {
		var sc = props.sc;
		function set( key ) { return function ( v ) { var n = {}; n[ key ] = v; props.onChange( n ); }; }
		// Integers for the REST schema; the angle keeps its 0.5° steps.
		function num( key, fallback ) {
			return function ( v ) {
				var n = {};
				if ( typeof v !== 'number' || ! isFinite( v ) ) n[ key ] = fallback;
				else n[ key ] = key === 'angle' ? Math.round( v * 2 ) / 2 : Math.round( v );
				props.onChange( n );
			};
		}
		function setRowCount( count ) {
			var rows = sc.rows.slice( 0, count );
			while ( rows.length < count ) rows.push( newScRow( rows.length ) );
			props.onChange( { rows: rows } );
		}
		function setRow( index, patch ) {
			props.onChange( { rows: sc.rows.map( function ( r, i ) { return i === index ? Object.assign( {}, r, patch ) : r; } ) } );
		}
		function rowNum( index, key, fallback ) {
			return function ( v ) { var n = {}; n[ key ] = typeof v === 'number' && isFinite( v ) ? Math.round( v ) : fallback; setRow( index, n ); };
		}
		var tilted = sc.layout !== 'straight';
		var rd     = data.shortcodeRowDefaults;

		var main = [
			el( 'div', { key: 'preview', className: 'marquezy-sticky-preview' },
				el( LivePreview, { html: shortcodeHtml( sc ), emptyText: __( 'Add a phrase to a row to see the preview.', 'marquezy' ) } ) )
		].concat( sc.rows.map( function ( row, i ) {
			return el( Section, {
				key: 'row' + i,
				title: sprintf(
					/* translators: %d: row number */
					__( 'Row %d — phrases', 'marquezy' ), i + 1 ),
				aside: el( 'span', { className: 'marquezy-row-dir-badge' }, row.direction === 'right' ? '→' : '←' )
			}, el( PhraseList, { rows: row.phrases, onChange: function ( list ) { setRow( i, { phrases: list } ); } } ) );
		} ) );

		var side = [
			el( C.PanelBody, { key: 'layout', title: __( 'Layout', 'marquezy' ), initialOpen: true },
				el( LayoutControl, {
					id: 'sc', value: sc.layout,
					onChange: function ( v ) {
						props.onChange( { layout: v } );
						if ( v === 'cross' && sc.rows.length !== 2 ) setRowCount( 2 );
					}
				} ),
				el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Rows', 'marquezy' ),
					help: sc.layout === 'cross' ? __( 'Crossing always uses two rows.', 'marquezy' ) : undefined,
					value: sc.rows.length, min: 1, max: 3, disabled: sc.layout === 'cross',
					onChange: function ( v ) { if ( v ) setRowCount( v ); }
				} ) ),
				tilted && el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Angle (°)', 'marquezy' ), value: sc.angle, min: -10, max: 10, step: 0.5, allowReset: true, resetFallbackValue: 4, onChange: num( 'angle', 4 ) } ) ),
				sc.layout === 'cross' && el( C.RangeControl, Object.assign( {}, CTRL, {
					label: __( 'Crossing point (%)', 'marquezy' ),
					help: __( 'Negative — left, positive — right of the center.', 'marquezy' ),
					value: sc.crossPoint, min: -40, max: 40, allowReset: true, resetFallbackValue: 0, onChange: num( 'crossPoint', 0 )
				} ) ),
				sc.layout !== 'cross' && sc.rows.length > 1 && el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Space between rows (px)', 'marquezy' ), value: sc.rowGap, min: 0, max: 80, allowReset: true, resetFallbackValue: 0, onChange: num( 'rowGap', 0 ) } ) ) ),

			el( C.PanelBody, { key: 'anim', title: __( 'Animation', 'marquezy' ), initialOpen: false },
				el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Speed (px/s)', 'marquezy' ), value: sc.speed, min: 10, max: 300, step: 5, allowReset: true, resetFallbackValue: 60, onChange: num( 'speed', 60 ) } ) ),
				el( C.ToggleControl, { __nextHasNoMarginBottom: true, label: __( 'Pause on hover', 'marquezy' ), checked: !! sc.pauseOnHover, onChange: set( 'pauseOnHover' ) } ) )
		].concat( sc.rows.map( function ( row, i ) {
			return el( C.PanelBody, {
					key: 'rowstyle' + i,
					title: sprintf(
						/* translators: %d: row number */
						__( 'Row %d — style', 'marquezy' ), i + 1 ),
					initialOpen: i === 0
				},
				el( DirectionControl, { id: 'sc-dir-' + i, value: row.direction, onChange: function ( v ) { setRow( i, { direction: v } ); } } ),
				el( ColorList, {
					label: __( 'Colors', 'marquezy' ),
					items: [
						{ key: 'bg', label: __( 'Background', 'marquezy' ), value: row.bg, emptyLabel: __( 'None', 'marquezy' ), onChange: function ( v ) { setRow( i, { bg: v } ); } },
						{ key: 'text', label: __( 'Text', 'marquezy' ), value: row.text, emptyLabel: __( 'Theme', 'marquezy' ), onChange: function ( v ) { setRow( i, { text: v } ); } },
						{ key: 'link', label: __( 'Links', 'marquezy' ), value: row.link, emptyLabel: __( 'As text', 'marquezy' ), onChange: function ( v ) { setRow( i, { link: v } ); } }
					]
				} ),
				el( SeparatorPicker, { value: row.separator, onChange: function ( v ) { setRow( i, { separator: v } ); } } ),
				el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Space around separator (px)', 'marquezy' ), value: row.gap, min: 0, max: 200, allowReset: true, resetFallbackValue: rd.gap, onChange: rowNum( i, 'gap', rd.gap ) } ) ),
				row.separator !== 'none' && el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Separator size (px)', 'marquezy' ), value: row.separatorSize, min: 8, max: 64, allowReset: true, resetFallbackValue: rd.separatorSize, onChange: rowNum( i, 'separatorSize', rd.separatorSize ) } ) ),
				row.separator !== 'none' && el( ColorList, { items: [ { key: 'sep', label: __( 'Separator color', 'marquezy' ), value: row.separatorColor, fallback: row.text, emptyLabel: __( 'Text color', 'marquezy' ), onChange: function ( v ) { setRow( i, { separatorColor: v } ); } } ] } ),
				el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Font size (px)', 'marquezy' ), value: row.fontSize, min: 8, max: 120, allowReset: true, resetFallbackValue: rd.fontSize, onChange: rowNum( i, 'fontSize', rd.fontSize ) } ) ),
				el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Vertical padding (px)', 'marquezy' ), value: row.padding, min: 0, max: 80, allowReset: true, resetFallbackValue: rd.padding, onChange: rowNum( i, 'padding', rd.padding ) } ) ),
				el( C.ToggleControl, { __nextHasNoMarginBottom: true, label: __( 'Drop shadow', 'marquezy' ), checked: !! row.shadow, onChange: function ( v ) { setRow( i, { shadow: v } ); } } ),
				row.shadow && el( 'div', { className: 'marquezy-sub-group' },
					el( ColorList, { items: [ { key: 'sh', label: __( 'Shadow color', 'marquezy' ), value: row.shadowColor, resetTo: rd.shadowColor, onChange: function ( v ) { setRow( i, { shadowColor: v } ); } } ] } ),
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Blur', 'marquezy' ), value: row.shadowBlur, min: 0, max: 120, onChange: rowNum( i, 'shadowBlur', 24 ) } ) ),
					el( 'div', { className: 'marquezy-mini-grid' },
						el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'X', 'marquezy' ) + ' · ' + row.shadowX + 'px', value: row.shadowX, min: -60, max: 60, withInputField: false, onChange: rowNum( i, 'shadowX', 0 ) } ) ),
						el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Y', 'marquezy' ) + ' · ' + row.shadowY + 'px', value: row.shadowY, min: -60, max: 60, withInputField: false, onChange: rowNum( i, 'shadowY', 8 ) } ) ) ),
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Spread', 'marquezy' ), value: row.shadowSpread, min: -40, max: 40, onChange: rowNum( i, 'shadowSpread', 0 ) } ) ) ) );
		} ) );

		return el( 'div', { className: 'marquezy-sc-editor' },
			el( 'div', { className: 'marquezy-sc-editor__head' },
				el( C.Button, { variant: 'tertiary', icon: 'arrow-left-alt2', onClick: props.onBack }, __( 'All shortcodes', 'marquezy' ) ),
				el( 'div', { className: 'marquezy-sc-editor__name' },
					el( C.TextControl, Object.assign( {}, CTRL, {
						label: __( 'Name (only for you)', 'marquezy' ),
						hideLabelFromVision: true,
						placeholder: __( 'Name, e.g. Home page promo', 'marquezy' ),
						value: sc.name,
						onChange: set( 'name' )
					} ) ) ),
				el( CopyCode, { text: codeFor( sc.id ) } ) ),
			el( EditorLayout, { main: main, side: side } ) );
	}

	function storedPhrases() {
		return data.options.phrases && ! Array.isArray( data.options.phrases ) ? data.options.phrases : {};
	}

	function initialRows() {
		var stored = storedPhrases();
		var map = {};
		data.languages.forEach( function ( lang ) {
			var list = Array.isArray( stored[ lang.key ] ) ? stored[ lang.key ] : [];
			map[ lang.key ] = list.length ? list.map( newRow ) : [ newRow( '' ) ];
		} );
		return map;
	}

	function App() {
		var optState   = useState( function () { var o = Object.assign( {}, data.options ); delete o.phrases; return o; } );
		var opts       = optState[ 0 ], setOpts = optState[ 1 ];
		var rowsState  = useState( initialRows );
		var rows       = rowsState[ 0 ], setRows = rowsState[ 1 ];
		var pagesState = useState( data.selected.pages || [] );
		var pageItems  = pagesState[ 0 ], setPageItems = pagesState[ 1 ];
		var termsState = useState( data.selected.terms || [] );
		var termItems  = termsState[ 0 ], setTermItems = termsState[ 1 ];
		var dirtyState = useState( false );
		var dirty      = dirtyState[ 0 ], setDirty = dirtyState[ 1 ];
		var savingSt   = useState( false );
		var saving     = savingSt[ 0 ], setSaving = savingSt[ 1 ];
		var noticeSt   = useState( [] );
		var notices    = noticeSt[ 0 ], setNotices = noticeSt[ 1 ];
		var tabSt      = useState( 'global' );
		var tab        = tabSt[ 0 ], setTab = tabSt[ 1 ];
		var scSt       = useState( function () { return ( data.shortcodes || [] ).map( toEditable ); } );
		var shortcodes = scSt[ 0 ], setShortcodes = scSt[ 1 ];
		var editSt     = useState( null );
		var editingId  = editSt[ 0 ], setEditingId = editSt[ 1 ];
		var savedIdsSt = useState( function () { return ( data.shortcodes || [] ).map( function ( s ) { return s.id; } ); } );
		var savedIds   = savedIdsSt[ 0 ], setSavedIds = savedIdsSt[ 1 ];

		var idCounter = useRef( Math.max(
			data.shortcodeNextId || 1,
			( data.shortcodes || [] ).reduce( function ( m, s ) { return Math.max( m, s.id ); }, 0 ) + 1
		) );
		// Ids only grow (also across deletions) — mirrors the server counter.
		function nextScId() {
			var id = Math.max( idCounter.current, shortcodes.reduce( function ( m, s ) { return Math.max( m, s.id ); }, 0 ) + 1 );
			idCounter.current = id + 1;
			return id;
		}
		function updateSc( id, patch ) {
			setShortcodes( function ( list ) { return list.map( function ( s ) { return s.id === id ? Object.assign( {}, s, patch ) : s; } ); } );
			setDirty( true );
		}
		function createSc() {
			var sc = Object.assign( {}, data.shortcodeDefaults, { id: nextScId(), rows: [ newScRow( 0 ), newScRow( 1 ) ] } );
			setShortcodes( function ( list ) { return list.concat( [ sc ] ); } );
			setEditingId( sc.id );
			setDirty( true );
		}
		function duplicateSc( id ) {
			var src = shortcodes.filter( function ( s ) { return s.id === id; } )[ 0 ];
			if ( ! src ) return;
			var copy = toEditable( toServer( src ) );
			copy.id = nextScId();
			copy.name = ( src.name || __( 'Untitled marquee', 'marquezy' ) ) + ' ' + __( '(copy)', 'marquezy' );
			setShortcodes( function ( list ) { return list.concat( [ copy ] ); } );
			setDirty( true );
		}
		function deleteSc( id ) {
			// eslint-disable-next-line no-alert
			if ( ! window.confirm( __( 'Delete this shortcode? Pages that use it will show nothing.', 'marquezy' ) ) ) return;
			setShortcodes( function ( list ) { return list.filter( function ( s ) { return s.id !== id; } ); } );
			if ( editingId === id ) setEditingId( null );
			setDirty( true );
		}

		// Every change bumps the revision; a save only clears "dirty" if nothing changed while it was running.
		var revision = useRef( 0 );
		var setDirtyRaw = setDirty;
		setDirty = function ( v ) { if ( v ) revision.current++; setDirtyRaw( v ); };

		function set( key ) {
			return function ( value ) {
				setOpts( function ( prev ) { var n = Object.assign( {}, prev ); n[ key ] = value; return n; } );
				setDirty( true );
			};
		}
		function setFlag( key ) { var s = set( key ); return function ( on ) { s( on ? 1 : 0 ); }; }
		function setNumber( key ) {
			var s = set( key );
			return function ( v ) { var n = parseInt( v, 10 ); s( isNaN( n ) ? data.defaults[ key ] : n ); };
		}
		function setLangRows( key ) {
			return function ( next ) {
				setRows( function ( prev ) { var n = Object.assign( {}, prev ); n[ key ] = next; return n; } );
				setDirty( true );
			};
		}

		function notify( content, status ) {
			var id = Date.now();
			setNotices( function ( list ) { return list.concat( [ { id: id, content: content, status: status } ] ); } );
			setTimeout( function () {
				setNotices( function ( list ) { return list.filter( function ( n ) { return n.id !== id; } ); } );
			}, 4000 );
		}

		function save() {
			var phrases = Object.assign( {}, storedPhrases() ); // keep languages that are no longer active
			Object.keys( rows ).forEach( function ( key ) {
				phrases[ key ] = rows[ key ].map( function ( r ) { return r.html; } ).filter( hasText );
			} );
			var payload = Object.assign( {}, opts, {
				phrases: phrases,
				rule_pages: pageItems.map( function ( i ) { return i.id; } ),
				rule_terms: termItems.map( function ( i ) { return i.id; } )
			} );

			setSaving( true );
			var startRevision = revision.current;
			wp.apiFetch( { path: '/wp/v2/settings', method: 'POST', data: { marquezy_options: payload, marquezy_shortcodes: shortcodes.map( toServer ) } } )
				.then( function ( res ) {
					var saved = res && res.marquezy_options ? res.marquezy_options : null;
					if ( saved ) {
						data.options = saved;
						var o = Object.assign( {}, saved ); delete o.phrases;
						setOpts( o );
					}
					var changedMeanwhile = revision.current !== startRevision;
					var savedSc = res && Array.isArray( res.marquezy_shortcodes ) ? res.marquezy_shortcodes : null;
					if ( savedSc ) {
						var ids = savedSc.map( function ( s ) { return s.id; } );
						// Take the sanitized server copy unless an editor is open or the user kept editing.
						if ( ! changedMeanwhile && editingId === null ) {
							setShortcodes( savedSc.map( toEditable ) );
						}
						setSavedIds( ids );
					}
					if ( ! changedMeanwhile ) setDirtyRaw( false );
					notify( __( 'Settings saved.', 'marquezy' ), 'success' );
				} )
				.catch( function ( err ) { notify( ( err && err.message ) || __( 'Could not save settings.', 'marquezy' ), 'error' ); } )
				.finally( function () { setSaving( false ); } );
		}

		useEffect( function () {
			if ( ! dirty ) return;
			function warn( e ) { e.preventDefault(); e.returnValue = ''; }
			window.addEventListener( 'beforeunload', warn );
			return function () { window.removeEventListener( 'beforeunload', warn ); };
		}, [ dirty ] );

		useEffect( function () {
			function onKey( e ) {
				if ( ( e.metaKey || e.ctrlKey ) && e.key === 's' ) { e.preventDefault(); if ( ! saving ) save(); }
			}
			document.addEventListener( 'keydown', onKey );
			return function () { document.removeEventListener( 'keydown', onKey ); };
		} );

		/* ── Content ── */
		function listFor( lang ) {
			return el( PhraseList, { key: lang.key, rows: rows[ lang.key ], onChange: setLangRows( lang.key ) } );
		}
		var content = data.languages.length > 1
			? el( C.TabPanel, {
					className: 'marquezy-lang-tabs',
					tabs: data.languages.map( function ( lang ) {
						var count = rows[ lang.key ].filter( function ( r ) { return hasText( r.html ); } ).length;
						return { name: lang.key, title: lang.name + ' (' + count + ')', className: 'marquezy-lang-tab' };
					} )
				}, function ( tab ) {
					return listFor( data.languages.filter( function ( l ) { return l.key === tab.name; } )[ 0 ] );
				} )
			: listFor( data.languages[ 0 ] );

		/* ── Where to show ── */
		var mode       = opts.display_mode;
		var hasRules   = pageItems.length || termItems.length || opts.rule_post_types.length || opts.rule_special.length;
		var conditions = ( mode === 'include' || mode === 'exclude' ) && el( 'div', { className: 'marquezy-rules' },
			el( 'h3', { className: 'marquezy-rules__title' }, mode === 'include' ? __( 'Show only on', 'marquezy' ) : __( 'Hide on', 'marquezy' ) ),
			mode === 'include' && ! hasRules && el( C.Notice, { status: 'warning', isDismissible: false },
				__( 'Nothing selected yet — the bar will not appear anywhere.', 'marquezy' ) ),
			el( CheckboxGroup, {
				id: 'marquezy-special', label: __( 'Special pages', 'marquezy' ),
				options: SPECIAL_OPTIONS, value: opts.rule_special, onChange: set( 'rule_special' )
			} ),
			el( CheckboxGroup, {
				id: 'marquezy-post-types', label: __( 'Post types', 'marquezy' ), help: __( 'Single views and archives of the selected types.', 'marquezy' ),
				options: data.postTypes.map( function ( pt ) { return { value: pt.slug, label: pt.label }; } ),
				value: opts.rule_post_types, onChange: set( 'rule_post_types' )
			} ),
			el( Grid, null,
				el( EntityPicker, {
					kind: 'post',
					label: __( 'Specific pages & posts', 'marquezy' ),
					placeholder: __( 'Search pages and posts…', 'marquezy' ),
					emptyText: __( 'No pages selected.', 'marquezy' ),
					items: pageItems,
					onChange: function ( items ) { setPageItems( items ); setDirty( true ); }
				} ),
				el( EntityPicker, {
					kind: 'term',
					label: __( 'Categories, tags & terms', 'marquezy' ),
					placeholder: __( 'Search terms…', 'marquezy' ),
					emptyText: __( 'No terms selected.', 'marquezy' ),
					items: termItems,
					onChange: function ( items ) { setTermItems( items ); setDirty( true ); }
				} ) ) );

		var sep = opts.separator !== 'none';
		var previewLang = data.languages[ 0 ].key;

		var globalMain = [
			el( 'div', { key: 'preview', className: 'marquezy-sticky-preview' },
				el( LivePreview, {
					flush: true,
					html: globalBarHtml( opts, ( rows[ previewLang ] || [] ).map( function ( r ) { return r.html; } ) ),
					emptyText: __( 'Add a phrase to see the preview.', 'marquezy' )
				} ) ),
			el( Section, {
				key: 'phrases',
				title: __( 'Phrases', 'marquezy' ),
				subtitle: __( 'Each phrase scrolls as a separate item. Enter adds the next phrase; select text for bold, italic or a link (Ctrl+K searches your pages).', 'marquezy' )
			}, content ),
			el( Section, { key: 'where', title: __( 'Where to show', 'marquezy' ) },
				el( C.RadioControl, {
					label: __( 'Placement', 'marquezy' ),
					hideLabelFromVision: true,
					help: MODE_HELP[ mode ],
					selected: mode,
					options: [
						{ label: __( 'Entire site', 'marquezy' ), value: 'all' },
						{ label: __( 'Only on selected pages', 'marquezy' ), value: 'include' },
						{ label: __( 'Everywhere except selected pages', 'marquezy' ), value: 'exclude' },
						{ label: __( 'Only where the Marquee block is placed', 'marquezy' ), value: 'manual' }
					],
					onChange: set( 'display_mode' )
				} ),
				conditions )
		];

		var globalSide = [
			el( C.PanelBody, { key: 'look', title: __( 'Appearance', 'marquezy' ), initialOpen: true },
				el( ColorList, {
					label: __( 'Colors', 'marquezy' ),
					items: [
						{ key: 'bg', label: __( 'Background', 'marquezy' ), value: opts.bg_color, resetTo: data.defaults.bg_color, onChange: set( 'bg_color' ) },
						{ key: 'text', label: __( 'Text', 'marquezy' ), value: opts.text_color, resetTo: data.defaults.text_color, onChange: set( 'text_color' ) },
						{ key: 'link', label: __( 'Links', 'marquezy' ), value: opts.link_color, resetTo: data.defaults.link_color, onChange: set( 'link_color' ) }
					]
				} ),
				el( 'div', { className: 'marquezy-mini-grid' },
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Font, desktop', 'marquezy' ) + ' · ' + opts.font_size + 'px', value: opts.font_size, min: 8, max: 72, withInputField: false, onChange: setNumber( 'font_size' ) } ) ),
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Font, mobile', 'marquezy' ) + ' · ' + opts.font_size_mobile + 'px', value: opts.font_size_mobile, min: 8, max: 72, withInputField: false, onChange: setNumber( 'font_size_mobile' ) } ) ) ),
				el( 'div', { className: 'marquezy-mini-grid' },
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Height', 'marquezy' ) + ' · ' + opts.height + 'px', value: opts.height, min: 20, max: 200, withInputField: false, onChange: setNumber( 'height' ) } ) ),
					el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Padding', 'marquezy' ) + ' · ' + opts.padding_v + 'px', value: opts.padding_v, min: 0, max: 60, withInputField: false, onChange: setNumber( 'padding_v' ) } ) ) ) ),

			el( C.PanelBody, { key: 'anim', title: __( 'Animation & separator', 'marquezy' ), initialOpen: false },
				el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Speed (px/s)', 'marquezy' ), value: opts.speed, min: 10, max: 300, step: 5, allowReset: true, resetFallbackValue: data.defaults.speed, onChange: setNumber( 'speed' ) } ) ),
				el( SeparatorPicker, { value: opts.separator, onChange: set( 'separator' ) } ),
				el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Space around separator (px)', 'marquezy' ), value: opts.gap, min: 0, max: 200, allowReset: true, resetFallbackValue: data.defaults.gap, onChange: setNumber( 'gap' ) } ) ),
				sep && el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Separator size (px)', 'marquezy' ), value: opts.separator_size, min: 8, max: 48, allowReset: true, resetFallbackValue: data.defaults.separator_size, onChange: setNumber( 'separator_size' ) } ) ),
				sep && el( ColorList, { items: [ { key: 'sep', label: __( 'Separator color', 'marquezy' ), value: opts.separator_color, fallback: opts.text_color, emptyLabel: __( 'Text color', 'marquezy' ), onChange: set( 'separator_color' ) } ] } ) ),

			el( C.PanelBody, { key: 'behavior', title: __( 'Behavior', 'marquezy' ), initialOpen: false },
				el( C.SelectControl, Object.assign( {}, CTRL, {
					label: __( 'Sticky mode', 'marquezy' ),
					help: STICKY_HELP[ opts.sticky_mode ],
					value: opts.sticky_mode,
					options: [
						{ label: __( 'Scroll with content', 'marquezy' ), value: 'scroll' },
						{ label: __( 'Always visible', 'marquezy' ), value: 'always' },
						{ label: __( 'Smart', 'marquezy' ), value: 'smart' }
					],
					onChange: set( 'sticky_mode' )
				} ) ),
				el( C.ToggleControl, { __nextHasNoMarginBottom: true, label: __( 'Close button', 'marquezy' ), checked: !! opts.close_button, onChange: setFlag( 'close_button' ) } ),
				!! opts.close_button && el( C.SelectControl, Object.assign( {}, CTRL, {
					label: __( 'Remember closing for', 'marquezy' ),
					value: opts.close_persist,
					options: [
						{ label: __( 'Browser session', 'marquezy' ), value: 'session' },
						{ label: __( '1 day', 'marquezy' ), value: 'day' },
						{ label: __( '1 week', 'marquezy' ), value: 'week' }
					],
					onChange: set( 'close_persist' )
				} ) ),
				el( C.ToggleControl, {
					__nextHasNoMarginBottom: true,
					label: __( 'Pause button', 'marquezy' ),
					help: __( 'Lets visitors stop the animation (WCAG 2.2.2).', 'marquezy' ),
					checked: !! opts.pause_button,
					onChange: setFlag( 'pause_button' )
				} ),
				el( C.ToggleControl, { __nextHasNoMarginBottom: true, label: __( 'Hide on mobile', 'marquezy' ), checked: !! opts.hide_mobile, onChange: setFlag( 'hide_mobile' ) } ),
				el( C.RangeControl, Object.assign( {}, CTRL, { label: __( 'Mobile breakpoint (px)', 'marquezy' ), help: __( 'Also switches to the mobile font size.', 'marquezy' ), value: opts.mobile_breakpoint, min: 320, max: 1920, allowReset: true, resetFallbackValue: data.defaults.mobile_breakpoint, onChange: setNumber( 'mobile_breakpoint' ) } ) ) ),

			el( C.PanelBody, { key: 'advanced', title: __( 'Advanced', 'marquezy' ), initialOpen: false },
				el( C.TextControl, Object.assign( {}, CTRL, {
					label: __( 'Header selector', 'marquezy' ),
					help: __( 'The bar is placed right after this element. Empty = auto-detect.', 'marquezy' ),
					placeholder: __( 'auto-detect', 'marquezy' ),
					value: opts.header_selector,
					spellCheck: false,
					onChange: set( 'header_selector' )
				} ) ),
				el( C.TextControl, Object.assign( {}, CTRL, { type: 'number', label: __( 'z-index', 'marquezy' ), value: String( opts.z_index ), min: 1, onChange: setNumber( 'z_index' ) } ) ) )
		];

		return el( C.SlotFillProvider, null,
			el( 'div', { className: 'marquezy-admin' },

				el( 'div', { className: 'marquezy-topbar' },
					el( 'div', { className: 'marquezy-topbar__title' },
						el( 'h1', null, __( 'Marquezy', 'marquezy' ) ),
						el( 'span', { className: 'marquezy-version' }, 'v' + data.version ) ),
					el( 'div', { className: 'marquezy-topbar__actions' },
						el( C.ToggleControl, {
							__nextHasNoMarginBottom: true,
							label: opts.enabled ? __( 'Global bar on', 'marquezy' ) : __( 'Global bar off', 'marquezy' ),
							checked: !! opts.enabled,
							onChange: setFlag( 'enabled' )
						} ),
						el( C.Button, { variant: 'primary', isBusy: saving, disabled: saving || ! dirty, onClick: save, __next40pxDefaultSize: true },
							saving ? __( 'Saving…', 'marquezy' ) : ( dirty ? __( 'Save', 'marquezy' ) : __( 'Saved', 'marquezy' ) ) ) ) ),

				el( 'div', { className: 'marquezy-tabs', role: 'tablist' },
					[ [ 'global', __( 'Global bar', 'marquezy' ) ], [ 'shortcodes', __( 'Shortcodes', 'marquezy' ) + ( shortcodes.length ? ' (' + shortcodes.length + ')' : '' ) ] ].map( function ( t ) {
						return el( 'button', {
							key: t[ 0 ], type: 'button', role: 'tab', 'aria-selected': tab === t[ 0 ],
							className: 'marquezy-tab' + ( tab === t[ 0 ] ? ' is-active' : '' ),
							onClick: function () { setTab( t[ 0 ] ); }
						}, t[ 1 ] );
					} ) ),

				tab === 'shortcodes' ? (
					editingId !== null && shortcodes.some( function ( s ) { return s.id === editingId; } )
						? el( ShortcodeEditor, {
							key: editingId,
							sc: shortcodes.filter( function ( s ) { return s.id === editingId; } )[ 0 ],
							onChange: function ( patch ) { updateSc( editingId, patch ); },
							onBack: function () { setEditingId( null ); }
						} )
						: el( 'div', { className: 'marquezy-sections' },
							el( ShortcodeList, {
								items: shortcodes,
								unsaved: shortcodes.map( function ( s ) { return s.id; } ).filter( function ( id ) { return savedIds.indexOf( id ) === -1; } ),
								onEdit: setEditingId,
								onCreate: createSc,
								onDuplicate: duplicateSc,
								onDelete: deleteSc
							} ) )
				) : el( EditorLayout, { main: globalMain, side: globalSide } ),

				el( C.SnackbarList, {
					className: 'marquezy-snackbars',
					notices: notices,
					onRemove: function ( id ) {
						setNotices( function ( list ) { return list.filter( function ( n ) { return n.id !== id; } ); } );
					}
				} ) ),
			el( C.Popover.Slot ) );
	}

	wp.domReady( function () {
		var root = document.getElementById( 'marquezy-admin-root' );
		// Older block editors (e.g. WP 6.2) need the keyboard shortcuts context around the editor.
		var KS  = wp.keyboardShortcuts;
		var app = KS && KS.ShortcutProvider ? el( KS.ShortcutProvider, null, el( App ) ) : el( App );
		if ( wp.element.createRoot ) {
			wp.element.createRoot( root ).render( app );
		} else {
			wp.element.render( app, root );
		}
	} );
} )( window.wp, window.marquezyAdminData );
