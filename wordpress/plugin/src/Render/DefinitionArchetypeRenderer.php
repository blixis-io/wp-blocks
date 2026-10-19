<?php
/** Allowlist based static rendering for phase-zero archetypes.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\ElementDefinitionRegistry;
use Blixis\Builder\Registry\SafeUrl;
\defined( 'ABSPATH' ) || exit;

/** Renders the safe static markup for supported definition archetypes. */
final class DefinitionArchetypeRenderer implements ArchetypeRenderer {
	private const TAGS = [
		'page'        => 'main',
		'stack'       => 'div',
		'row'         => 'div',
		'columns'     => 'div',
		'grid'        => 'div',
		'card'        => 'article',
		'navigation'  => 'nav',
		'site-header' => 'header',
		'site-footer' => 'footer',
		'site-logo'   => 'a',
		'container'   => 'div',
		'section'     => 'section',
		'heading'     => 'h2',
		'blockquote'  => 'blockquote',
		'badge'       => 'span',
		'text'        => 'p',
		'button'      => 'a',
		'image'       => 'div',
	];
	/** Create renderer with generated definitions.
	 *
	 * @param ElementDefinitionRegistry $definitions Definition metadata.
	 * @param MediaResolver             $media Media adapter.
	 */
	public function __construct( private readonly ElementDefinitionRegistry $definitions, private readonly MediaResolver $media ) {}
	/** Check archetype support.
	 *
	 * @param string $archetype Archetype name.
	 */
	public function supports( string $archetype ): bool {
		return in_array( $archetype, [ 'container','simple','text','richtext','heading','button','link','image','gallery','video','audio','embed','iframe','pdf-viewer','map','navigation','pagination','list','loop','code','accordion','tabs','steps','overlay','alert','progress','counter','countdown','icon','dynamic','card','layout','section','page','site-header','site-footer','site-logo','row','columns','grid','stack','input','choice','toggle','range','datatable','chart','rating','calendar','command','carousel','animation','form' ], true ); }
	/** Render an element with escaped text and allowlisted tags/attributes.
	 *
	 * @param ElementNode   $node Element input.
	 * @param RenderContext $context Child content and token metadata.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$id         = preg_replace( '~^blixis/~', '', $node->type );
		$definition = $this->definitions->get( (string) $id );
		$archetype  = is_array( $definition ) ? (string) ( $definition['archetype'] ?? '' ) : '';
		if ( ! $this->supports( $archetype ) || ( 'loop' === $archetype && ! in_array( $id, [ 'query-loop', 'related-posts' ], true ) ) || ( 'animation' === $archetype && ! in_array( $id, [ 'entrance-animation', 'scroll-reveal', 'hover-tilt', 'scroll-timeline', 'stagger-container', 'typing-indicator', 'horizontal-scroll' ], true ) ) || ( 'form' === $archetype && ! in_array( $id, [ 'site-search', 'form', 'contact-form', 'newsletter-signup' ], true ) ) ) {
			return ( new StaticFallbackRenderer() )->render( $node, $context );
		}
		$tag = self::TAGS[ (string) $id ] ?? match ( $archetype ) {
			'heading' => 'h2', 'text', 'richtext' => 'p', 'navigation' => 'nav', default => 'div' };
		$tag_definition = is_array( $definition ) && is_array( $definition['properties']['tag'] ?? null ) ? $definition['properties']['tag'] : null;
		if ( null !== $tag_definition ) {
			$allowed_tags = $tag_definition['options'] ?? [];
			$candidate    = $node->value( 'tag', $tag_definition['default'] ?? $tag );
			if ( is_string( $candidate ) && is_array( $allowed_tags ) && in_array( $candidate, $allowed_tags, true ) ) {
				$tag = $candidate;
			}
		}
		$hooks = Escape::hooks( $node );
		if ( 'site-search' === $id ) {
			return $this->render_site_search( $node, $hooks );
		}
		if ( in_array( $id, [ 'form', 'contact-form', 'newsletter-signup' ], true ) ) {
			return $this->render_form( $id, $node, $hooks, $context->children_html, $context->preview );
		}
		if ( in_array( $id, [ 'form-success', 'form-error' ], true ) ) {
			return $this->render_form_feedback( $id, $node, $hooks );
		}
		if ( 'submit-button' === $id ) {
			$label = $node->value( 'label', $this->translate_label( 'Submit' ) );
			$label = is_string( $label ) && '' !== trim( $label ) ? trim( $label ) : $this->translate_label( 'Submit' );
			return '<button' . $hooks . ' type="' . ( $context->preview ? 'button" disabled' : 'submit"' ) . '>' . Escape::html( $label ) . '</button>';
		}
		if ( 'show-more' === $id ) {
			return $this->render_show_more( $node, $hooks, $context->children_html );
		}
		if ( 'horizontal-scroll' === $id ) {
			$label = $node->value( 'ariaLabel', $this->translate_label( 'Horizontally scrollable content' ) );
			$label = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Horizontally scrollable content' );
			return '<div' . $hooks . ' data-blx-horizontal-scroll role="region" tabindex="0" aria-label="' . Escape::attr( $label ) . '">' . $context->children_html . '</div>';
		}
		if ( 'typing-indicator' === $id ) {
			$label = $node->value( 'ariaLabel', $this->translate_label( 'Typing' ) );
			$label = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Typing' );
			return '<span' . $hooks . ' data-blx-typing-indicator role="status" aria-label="' . Escape::attr( $label ) . '"><span aria-hidden="true"><i></i><i></i><i></i></span></span>';
		}
		if ( in_array( $id, [ 'entrance-animation', 'scroll-reveal', 'hover-tilt', 'scroll-timeline', 'stagger-container' ], true ) ) {
			return $this->render_motion_reveal( $node, $hooks, $context->children_html );
		}
		if ( 'button-group' === $id ) {
			$hooks .= ' role="group"';
		}
		if ( 'container' === $archetype ) {
			$fallback = 'section' === $id ? 'section' : 'div';
			$tag      = $this->semantic_tag( $node->value( 'semanticTag', $node->value( 'tag', $fallback ) ), $fallback );
			$hooks   .= $this->layout_attributes( $node );
		}
		if ( 'spacer' === $id ) {
			return '<div' . $hooks . ' aria-hidden="true"></div>';
		}
		if ( 'resizable-panels' === $id ) {
			return $this->render_resizable_panels( $node, $context->children_html_list, $hooks, $tag );
		}
		if ( 'marquee-layout' === $id ) {
			return $this->render_marquee_layout( $node, $context->children_html, $hooks, $tag );
		}
		if ( 'logo-marquee' === $id ) {
			$duration_ms = $node->value( 'durationMs', 16000 );
			$duration    = is_numeric( $duration_ms ) ? max( 10, min( 120, (int) round( (float) $duration_ms / 1000 ) ) ) : 16;
			if ( true !== $node->value( 'autoplay', false ) ) {
				return '<' . $tag . $hooks . ' data-blx-marquee="left" data-blx-marquee-duration="' . $duration . '">' . $context->children_html . '</' . $tag . '>';
			}
			return $this->render_marquee_layout(
				new ElementNode(
					$node->id,
					$node->type,
					[
						'direction' => 'left',
						'duration'  => $duration,
					]
				),
				$context->children_html,
				$hooks,
				$tag
			);
		}
		if ( 'scroll-area' === $id ) {
			$label = $node->value( 'ariaLabel' );
			return '<' . $tag . $hooks . ' data-blx-scroll-area tabindex="0"' . ( is_string( $label ) && '' !== trim( $label ) ? ' role="region"' : '' ) . '>' . $context->children_html . '</' . $tag . '>';
		}
		if ( 'separator' === $id ) {
			return '<hr' . $hooks . ' aria-hidden="true">';
		}
		if ( 'list' === $archetype ) {
			if ( 'icon-list' === $id ) {
				return $this->render_icon_list( $node, $hooks );
			}
			return $this->render_list( $node, $hooks );
		}
		if ( 'code' === $archetype ) {
			$language = $node->value( 'language', 'text' );
			$allowed  = [ 'text', 'html', 'css', 'js', 'ts', 'json', 'php', 'bash' ];
			$language = is_string( $language ) && in_array( $language, $allowed, true ) ? $language : 'text';
			$code     = $node->value( 'code', '' );
			return $this->render_code_block( $node, $hooks, $language, is_string( $code ) ? $code : '', 'syntax-highlighter' === $id );
		}
		if ( 'countdown' === $id ) {
			return $this->render_countdown( $node, $hooks );
		}
		if ( 'icon-list' === $id ) {
			return $this->render_icon_list( $node, $hooks );
		}
		if ( in_array( $id, [ 'icon', 'icon-svg' ], true ) ) {
			return $this->render_icon( $node, $hooks );
		}
		if ( 'icon-button' === $id ) {
			return $this->render_icon_button( $node, $hooks );
		}
		if ( in_array( $id, [ 'switch', 'checkbox', 'radio-group', 'select', 'combobox', 'toggle', 'toggle-group', 'segmented-control', 'slider', 'range-slider', 'input', 'textarea', 'date-picker', 'text-field', 'email-field', 'password-field', 'number-field', 'url-field', 'search-field', 'hidden-field' ], true ) ) {
			return $this->render_ui_control( $id, $node, $hooks );
		}
		if ( 'calendar' === $id ) {
			return $this->render_calendar( $node, $hooks );
		}
		if ( 'date-range-picker' === $id ) {
			return $this->render_date_range( $node, $hooks );
		}
		if ( in_array( $id, [ 'data-table', 'sortable-table' ], true ) ) {
			return $this->render_data_table( $id, $node, $hooks );
		}
		if ( 'chart' === $id ) {
			return $this->render_chart_summary( $node, $hooks );
		}
		if ( 'rating' === $id ) {
			return $this->render_rating( $node, $hooks );
		}
		if ( 'copy-button' === $id ) {
			$label = $node->value( 'label', 'Copy' );
			$label = is_string( $label ) ? $label : 'Copy';
			$text  = $node->value( 'copyText', '' );
			$text  = is_string( $text ) ? $text : '';
			return '<span' . $hooks . '><button type="button" data-blx-copy-button data-blx-copy-text="' . Escape::attr( $text ) . '" data-blx-copy-success="' . Escape::attr( $this->translate_label( 'Copied.' ) ) . '" data-blx-copy-failed="' . Escape::attr( $this->translate_label( 'Copy failed.' ) ) . '"' . ( true === $node->value( 'disabled', false ) ? ' disabled' : '' ) . '>' . Escape::html( $label ) . '</button><span data-blx-copy-status aria-live="polite"></span></span>';
		}
		if ( 'loading-button' === $id ) {
			$label         = $node->value( 'label', 'Submit' );
			$label         = is_string( $label ) ? $label : 'Submit';
			$loading_label = $node->value( 'loadingLabel', 'Loading…' );
			$loading_label = is_string( $loading_label ) ? $loading_label : 'Loading…';
			return '<button' . $hooks . ' type="submit" data-blx-loading-button data-blx-loading-label="' . Escape::attr( $loading_label ) . '" aria-busy="false"' . ( true === $node->value( 'disabled', false ) ? ' disabled' : '' ) . '>' . Escape::html( $label ) . '</button>';
		}
		if ( in_array( $id, [ 'toast', 'notification-center' ], true ) ) {
			return $this->render_toast( $node, $hooks, $context->children_html );
		}
		if ( 'tooltip-text' === $id ) {
			return $this->render_tooltip_text( $node, $hooks, $tag );
		}
		if ( 'label' === $id ) {
			$content = $node->value( 'content', '' );
			$content = is_string( $content ) ? Escape::html( $content ) : '';
			$for_id  = $node->value( 'forId', '' );
			$for_id  = is_string( $for_id ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_:\-.]{0,63}$/D', $for_id ) ? ' for="' . Escape::attr( $for_id ) . '"' : '';
			return '<label' . $hooks . $for_id . '>' . $content . $context->children_html . '</label>';
		}
		if ( 'link' === $archetype ) {
			$label  = $node->value( 'label', '' );
			$href   = $node->value( 'href', '#' );
			$target = '_blank' === $node->value( 'target', '_self' ) ? '_blank' : '_self';
			$rel    = $node->value( 'rel', 'noopener noreferrer' );
			$rel    = is_string( $rel ) && in_array( $rel, [ 'noopener noreferrer', 'nofollow', 'sponsored', 'ugc' ], true ) ? $rel : 'noopener noreferrer';
			if ( '_blank' === $target && 'noopener noreferrer' !== $rel ) {
				$rel = 'noopener noreferrer ' . $rel;
			}
			return '<a' . $hooks . ' href="' . Escape::url( is_string( $href ) ? $href : '#' ) . '" target="' . $target . '" rel="' . Escape::attr( $rel ) . '">' . Escape::html( is_string( $label ) ? $label : '' ) . '</a>';
		}
		if ( 'featured-image' === $id ) {
			if ( ! $node->value( 'assetRef' ) && function_exists( 'get_post_thumbnail_id' ) ) {
				$thumbnail_id = get_post_thumbnail_id();
				if ( is_int( $thumbnail_id ) && $thumbnail_id > 0 ) {
					$node = new ElementNode( $node->id, $node->type, array_merge( $node->values, [ 'assetRef' => 'attachment:' . $thumbnail_id ] ), $node->classes );
				}
			}
			$image = $this->asset_image( $node );
			if ( '' === $image ) {
				return '';
			}
			$caption = $node->value( 'caption', '' );
			return '<figure' . $hooks . '>' . $image . ( is_string( $caption ) && '' !== trim( $caption ) ? '<figcaption>' . Escape::html( $caption ) . '</figcaption>' : '' ) . '</figure>';
		}
		if ( 'author-box' === $id ) {
			return $this->render_author_box( $node, $hooks );
		}
		if ( 'comments-list' === $id ) {
			return $this->render_comments_list( $node, $hooks );
		}
		if ( 'query-loop' === $id || 'related-posts' === $id ) {
			return $this->render_post_loop( $node, $hooks, 'related-posts' === $id );
		}
		if ( 'query-pagination' === $id ) {
			return $this->render_query_pagination( $node, $hooks );
		}
		if ( 'table-of-posts' === $id ) {
			return $this->render_data_table( 'data-table', $node, $hooks );
		}
		if ( 'container' === $id ) {
			$width = $node->value( 'maxWidthToken', $node->value( 'maxWidth', 'default' ) );
			if ( ! is_string( $width ) || ! preg_match( '/^[a-z0-9-]{1,40}$/D', $width ) ) {
				$width = 'default';
			} $hooks .= ' data-blx-max-width="' . Escape::attr( $width ) . '"'; }
		if ( 'back-to-top' === $id ) {
			$label = $node->value( 'label', $this->translate_label( 'Back to top' ) );
			return '<a' . $hooks . ' href="#" data-blx-back-to-top>' . Escape::html( is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Back to top' ) ) . '</a>';
		}
		if ( in_array( $id, [ 'text','heading','button','site-title','rich-text','paragraph' ], true ) || in_array( $archetype, [ 'text','richtext' ], true ) ) {
			$value = $node->value( 'content', $node->value( 'text', $node->value( 'label', '' ) ) );
			if ( 'site-title' === $id && function_exists( 'get_bloginfo' ) ) {
				$site_title = get_bloginfo( 'name' );
				$value      = is_string( $site_title ) && '' !== trim( $site_title ) ? $site_title : $value;
			}
			if ( is_array( $value ) && array_is_list( $value ) ) {
				$value = implode( '', array_map( static fn ( mixed $part ): string => is_array( $part ) && is_string( $part['text'] ?? null ) ? $part['text'] : '', $value ) );
			}
			$body = is_string( $value ) ? Escape::html( $value ) : RichText::render_validated( $value, true, $context->token_ids );
			if ( 'keyboard-shortcut' === $id ) {
				return '<kbd' . $hooks . '>' . $body . '</kbd>';
			}
			if ( 'empty-state' === $id ) {
				return '<div' . $hooks . '>' . $body . '</div>';
			}
			if ( 'highlight-text' === $id ) {
				$body = '<mark>' . $body . '</mark>';
			}
			if ( 'gradient-text' === $id ) {
				return '<' . $tag . $hooks . ' data-blx-gradient-text style="background-image:' . Escape::attr( $this->gradient_value( $node->value( 'gradient' ) ) ) . ';-webkit-background-clip:text;background-clip:text;color:transparent">' . $body . '</' . $tag . '>';
			}
			if ( 'animated-headline' === $id ) {
				$label  = is_string( $value ) ? $value : '';
				$parts  = preg_split( '/(\s+)/u', $label, -1, PREG_SPLIT_DELIM_CAPTURE );
				$parts  = is_array( $parts ) ? $parts : [ $label ];
				$visual = '';
				foreach ( $parts as $index => $part ) {
					$visual .= '' === trim( $part ) ? Escape::html( $part ) : '<span data-blx-headline-part style="--blx-headline-index:' . (int) $index . '">' . Escape::html( $part ) . '</span>';
				}
				return '<' . $tag . $hooks . ' data-blx-animated-headline aria-label="' . Escape::attr( $label ) . '"><span aria-hidden="true">' . $visual . '</span></' . $tag . '>';
			}
			if ( 'button' === $id ) {
				$href        = $node->value( 'href', $node->value( 'url', '#' ) );
				$target      = $node->value( 'target' );
				$target_attr = '_blank' === $target ? ' target="_blank" rel="noopener noreferrer"' : '';
				return '<a' . $hooks . ' href="' . Escape::url( is_string( $href ) ? $href : '#' ) . '"' . $target_attr . '>' . $body . '</a>'; }
			return '<' . $tag . $hooks . '>' . $body . '</' . $tag . '>';
		}
		if ( 'navigation' === $archetype && in_array( $id, [ 'breadcrumbs', 'breadcrumb-ui' ], true ) && is_array( $node->value( 'items', null ) ) ) {
			return $this->render_breadcrumbs( $node, $hooks );
		}
		if ( 'pagination' === $archetype && 'pagination' === $id ) {
			return $this->render_pagination( $node, $hooks );
		}
		if ( in_array( $id, [ 'dropdown-menu', 'context-menu' ], true ) ) {
			$label  = $node->value( 'triggerLabel', $this->translate_label( 'Open menu' ) );
			$label  = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Open menu' );
			$items  = $node->value( 'items', [] );
			$items  = is_array( $items ) ? $items : [];
			$marker = 'context-menu' === $id ? ' data-blx-context-menu' : ' data-blx-dropdown-menu';
			return '<details' . $hooks . $marker . '><summary>' . Escape::html( $label ) . '</summary><ul>' . $this->navigation_items( $items, 0 ) . '</ul></details>';
		}
		if ( 'navigation' === $archetype && in_array( $id, [ 'navigation', 'navigation-menu', 'nav-menu', 'mobile-menu', 'table-of-contents', 'anchor-links', 'mega-menu', 'sidebar-navigation', 'scroll-spy', 'sticky-header', 'dropdown-menu' ], true ) && is_array( $node->value( 'items', null ) ) ) {
			$default_label = match ( $id ) {
				'mobile-menu' => $this->translate_label( 'Mobile navigation' ),
				'sidebar-navigation' => $this->translate_label( 'Sidebar navigation' ),
				default => $this->translate_label( 'Navigation' ),
			};
			$label = $node->value( 'ariaLabel', $default_label );
			$label = is_string( $label ) && '' !== trim( $label ) ? $label : $default_label;
			$list  = '<ul>' . $this->navigation_items( $node->value( 'items', [] ), 0 ) . '</ul>';
			$nav   = '<nav aria-label="' . Escape::attr( $label ) . '">' . $list . '</nav>';
			if ( 'mobile-menu' === $id ) {
				return '<details' . $hooks . ' data-blx-mobile-menu><summary>' . Escape::html( $this->translate_label( 'Menu' ) ) . '</summary>' . $nav . '</details>';
			}
			if ( 'sticky-header' === $id ) {
				$offset = $node->value( 'stickyOffset', 0 );
				$offset = is_numeric( $offset ) && is_finite( (float) $offset ) ? max( 0, min( 256, (float) $offset ) ) : 0;
				return '<header' . $hooks . ' data-blx-sticky-header style="--blx-sticky-offset:' . Escape::attr( sprintf( '%g', $offset ) ) . 'px">' . $nav . '</header>';
			}
			if ( 'mega-menu' === $id ) {
				return '<nav' . $hooks . ' data-blx-mega-menu aria-label="' . Escape::attr( $label ) . '">' . $list . '</nav>';
			}
			return '<nav' . $hooks . ' data-blx-navigation-orientation="' . Escape::attr( $node->value( 'orientation', 'horizontal' ) === 'vertical' ? 'vertical' : 'horizontal' ) . '"' . ( 'scroll-spy' === $id ? ' data-blx-scroll-spy' : '' ) . ' aria-label="' . Escape::attr( $label ) . '">' . $list . '</nav>';
		}
		if ( 'accordion' === $archetype ) {
			return $this->render_accordion( $node, $hooks );
		}
		if ( 'overlay' === $archetype && 'offcanvas' === $id ) {
			return $this->render_offcanvas( $node, $context->children_html, $hooks );
		}
		if ( in_array( $id, [ 'dialog', 'alert-dialog', 'drawer', 'sheet' ], true ) ) {
			$overlay = $this->render_offcanvas( $node, $context->children_html, $hooks );
			$role    = 'alert-dialog' === $id ? 'alertdialog' : 'dialog';
			return str_replace( '<div data-blx-offcanvas-panel tabindex="-1">', '<div data-blx-offcanvas-panel role="' . $role . '" tabindex="-1">', $overlay );
		}
		if ( 'tooltip' === $id ) {
			return $this->render_tooltip_component( $node, $context->children_html, $hooks );
		}
		if ( in_array( $id, [ 'popover', 'hover-card' ], true ) ) {
			return $this->render_offcanvas( $node, $context->children_html, $hooks );
		}
		if ( 'command-palette' === $id ) {
			return $this->render_command_palette( $node, $hooks );
		}
		if ( in_array( $id, [ 'carousel', 'scroll-snap-carousel' ], true ) ) {
			return $this->render_carousel( $node, $context->children_html_list, $hooks );
		}
		if ( in_array( $id, [ 'scroll-indicator', 'reading-progress', 'scroll-progress' ], true ) ) {
			return $this->render_scroll_indicator( $node, $hooks );
		}
		if ( 'tabs' === $archetype ) {
			return $this->render_tabs( $node, $hooks );
		}
		if ( 'steps' === $archetype ) {
			return $this->render_steps( $node, $hooks );
		}
		if ( 'alert' === $archetype ) {
			return $this->render_alert( $node, $hooks, $context->children_html );
		}
		if ( 'progress' === $archetype && 'progress-ring' === $id ) {
			return $this->render_progress_ring( $node, $hooks );
		}
		if ( 'progress' === $archetype ) {
			return $this->render_progress( $node, $hooks );
		}
		if ( 'counter' === $archetype && in_array( $id, [ 'counter', 'number-ticker' ], true ) ) {
			$value = $node->value( 'value', 42 );
			if ( ( ! is_int( $value ) && ! is_float( $value ) ) || ! is_finite( (float) $value ) ) {
				$value = 42;
			}
			$value  = max( -1000000000, min( 1000000000, (float) $value ) );
			$text   = is_int( $value ) ? (string) $value : sprintf( '%g', $value );
			$prefix = $node->value( 'prefix', '' );
			$suffix = $node->value( 'suffix', '' );
			$label  = $node->value( 'ariaLabel' );
			if ( 'number-ticker' === $id ) {
				$duration = $node->value( 'durationMs', 900 );
				$duration = is_numeric( $duration ) ? max( 100, min( 10000, (int) $duration ) ) : 900;
				return '<span' . $hooks . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . '><span>' . Escape::html( is_string( $prefix ) ? $prefix : '' ) . '</span><span data-blx-number-ticker data-blx-number-target="' . Escape::attr( $text ) . '" data-blx-number-duration="' . $duration . '">' . Escape::html( $text ) . '</span><span>' . Escape::html( is_string( $suffix ) ? $suffix : '' ) . '</span></span>';
			}
			return '<span' . $hooks . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . '>' . Escape::html( is_string( $prefix ) ? $prefix : '' ) . Escape::html( $text ) . Escape::html( is_string( $suffix ) ? $suffix : '' ) . '</span>';
		}
		if ( 'stat-card' === $id ) {
			$value  = $node->value( 'value', 0 );
			$value  = is_numeric( $value ) && is_finite( (float) $value ) ? sprintf( '%g', (float) $value ) : '0';
			$prefix = $node->value( 'prefix', '' );
			$suffix = $node->value( 'suffix', '' );
			$label  = $node->value( 'ariaLabel', '' );
			return '<article' . $hooks . '><data value="' . Escape::attr( $value ) . '"' . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . '>' . Escape::html( is_string( $prefix ) ? $prefix : '' ) . Escape::html( $value ) . Escape::html( is_string( $suffix ) ? $suffix : '' ) . '</data></article>';
		}
		if ( 'dynamic' === $archetype ) {
			return $this->render_dynamic( $node, $hooks );
		}
		if ( in_array( $id, [ 'skeleton', 'spinner' ], true ) ) {
			return 'spinner' === $id
				? '<span' . $hooks . ' role="status"' . ( is_string( $node->value( 'ariaLabel' ) ) ? ' aria-label="' . Escape::attr( $node->value( 'ariaLabel' ) ) . '"' : '' ) . '><span aria-hidden="true" data-blx-spinner></span></span>'
				: '<span' . $hooks . ' aria-hidden="true" data-blx-skeleton></span>';
		}
		if ( 'card' === $archetype && ( is_string( $node->value( 'title' ) ) || is_string( $node->value( 'description' ) ) ) ) {
			$title       = $node->value( 'title', '' );
			$description = $node->value( 'description', '' );
			$href        = $node->value( 'href' );
			$heading     = is_string( $title ) && '' !== $title ? '<h2>' . ( is_string( $href ) && '' !== $href ? '<a href="' . Escape::url( $href ) . '">' . Escape::html( $title ) . '</a>' : Escape::html( $title ) ) . '</h2>' : '';
			$body        = is_string( $description ) && '' !== $description ? '<p>' . Escape::html( $description ) . '</p>' : '';
			return '<article' . $hooks . '>' . $heading . $body . $context->children_html . '</article>';
		}

		if ( 'site-logo' === $id ) {
			$href = $node->value( 'link', '/' );
			return '<a' . $hooks . ' href="' . Escape::url( is_string( $href ) ? $href : '/' ) . '" aria-label="Site logo">' . $this->asset_image( $node ) . '</a>';
		}
		if ( in_array( $id, [ 'embed', 'iframe', 'pdf-viewer' ], true ) ) {
			return $this->render_external_frame( $node, $hooks, $id );
		}
		if ( 'map' === $id ) {
			return $this->render_map( $node, $hooks );
		}
		if ( 'gallery' === $archetype ) {
			return $this->render_gallery( $node, $hooks );
		}
		if ( in_array( $archetype, [ 'video', 'audio' ], true ) ) {
			return $this->render_playable_media( $node, $hooks, $archetype );
		}
		if ( 'image' === $archetype && in_array( $id, [ 'image', 'picture', 'avatar', 'featured-image', 'product-image', 'before-after', 'image-comparison', 'image-hotspots', 'panorama-360', 'blur-up-image' ], true ) ) {
			if ( 'image-hotspots' === $id ) {
				return $this->render_image_hotspots( $node, $hooks );
			}
			if ( 'panorama-360' === $id ) {
				return $this->render_panorama( $node, $hooks );
			}
			if ( in_array( $id, [ 'before-after', 'image-comparison' ], true ) ) {
				return $this->render_image_comparison( $node, $hooks );
			}
			$image = $this->asset_image( $node );
			if ( '' !== $image ) {
				$caption = $node->value( 'caption', '' );
				if ( is_string( $caption ) && '' !== $caption && in_array( $id, [ 'image', 'picture' ], true ) ) {
					return '<figure>' . $image . '<figcaption>' . Escape::html( $caption ) . '</figcaption></figure>';
				}
				return $image;
			}
			$attachment_id = $node->value( 'attachmentId' );
			if ( is_int( $attachment_id ) && $attachment_id > 0 ) {
				return ( new ImageRenderer( $this->media ) )->render( $node, $context );
			}
			return '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		return '<' . $tag . $hooks . '>' . $context->children_html . '</' . $tag . '>';
	}

	/** Render an entrance/reveal with a visible static fallback.
	 *
	 * @param ElementNode $node Element settings.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $children Rendered children.
	 */
	private function render_motion_reveal( ElementNode $node, string $hooks, string $children ): string {
		$effect   = $node->value( 'effect', 'fade-in' );
		$effect   = is_string( $effect ) && in_array( $effect, [ 'fade-in', 'slide-in-left', 'slide-in-right', 'slide-in-up', 'scale-in' ], true ) ? $effect : 'fade-in';
		$trigger  = $node->value( 'trigger', 'viewport-enter' );
		$trigger  = 'scroll-timeline' === preg_replace( '~^blixis/~', '', $node->type ) ? 'scroll' : ( is_string( $trigger ) && in_array( $trigger, [ 'viewport-enter', 'page-load', 'hover' ], true ) ? $trigger : 'static' );
		$duration = $node->value( 'durationMs', 600 );
		$duration = is_numeric( $duration ) ? max( 0, min( 3000, (int) $duration ) ) : 600;
		$delay    = $node->value( 'delayMs', 0 );
		$delay    = is_numeric( $delay ) ? max( 0, min( 3000, (int) $delay ) ) : 0;
		$easing   = $node->value( 'easing', 'ease-out' );
		$easing   = is_string( $easing ) && in_array( $easing, [ 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out' ], true ) ? $easing : 'ease-out';
		$id_attr  = preg_replace( '~^blixis/~', '', $node->type );
		return '<div' . $hooks . ' data-blx-motion="' . Escape::attr( $trigger ) . '" data-blx-motion-id="' . Escape::attr( (string) $id_attr ) . '" data-blx-motion-effect="' . Escape::attr( $effect ) . '" style="--blx-motion-duration:' . $duration . 'ms;--blx-motion-delay:' . $delay . 'ms;--blx-motion-easing:' . Escape::attr( $easing ) . '">' . $children . '</div>';
	}

	/** Render a safe, two-image comparison with a static fallback and progressive range control.
	 *
	 * @param ElementNode $node Comparison element.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_image_comparison( ElementNode $node, string $hooks ): string {
		$before_reference = $node->value( 'beforeAssetRef' );
		$after_reference  = $node->value( 'afterAssetRef' );
		$before           = is_string( $before_reference ) ? $this->resolve_image_reference( $before_reference ) : null;
		$after            = is_string( $after_reference ) ? $this->resolve_image_reference( $after_reference ) : null;
		if ( ! is_array( $before ) || ! is_array( $after ) || ! is_string( $before['url'] ?? null ) || ! is_string( $after['url'] ?? null ) || ! SafeUrl::accepts( $before['url'] ) || ! SafeUrl::accepts( $after['url'] ) ) {
			$fallback = $this->asset_image( $node );
			return '' !== $fallback ? '<figure' . $hooks . '>' . $fallback . '</figure>' : '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		$position   = $node->value( 'comparisonPosition', 50 );
		$position   = is_numeric( $position ) ? max( 0, min( 100, (int) $position ) ) : 50;
		$before_alt = $node->value( 'beforeAlt', __( 'Before', 'blixis-builder' ) );
		$after_alt  = $node->value( 'afterAlt', __( 'After', 'blixis-builder' ) );
		$before_alt = is_string( $before_alt ) ? $before_alt : '';
		$after_alt  = is_string( $after_alt ) ? $after_alt : '';
		$label      = $node->value( 'ariaLabel', __( 'Compare images', 'blixis-builder' ) );
		$label      = is_string( $label ) && '' !== trim( $label ) ? $label : __( 'Compare images', 'blixis-builder' );
		$caption    = $node->value( 'caption', '' );
		$caption    = is_string( $caption ) ? $caption : '';
		$html       = '<figure' . $hooks . ' data-blx-image-comparison data-blx-comparison-position="' . $position . '" role="group" aria-label="' . Escape::attr( $label ) . '"><div data-blx-comparison-canvas>';
		$html      .= $this->comparison_image( $before, $before_alt, 'before' ) . $this->comparison_image( $after, $after_alt, 'after' );
		$html      .= '</div><label data-blx-comparison-label>' . Escape::html( $label ) . '<input type="range" min="0" max="100" value="' . $position . '" aria-label="' . Escape::attr( $label ) . '" data-blx-comparison-control hidden></label>';
		if ( '' !== $caption ) {
			$html .= '<figcaption>' . Escape::html( $caption ) . '</figcaption>';
		}
		return $html . '</figure>';
	}

	/** Render one resolved comparison image.
	 *
	 * @param array<string,mixed> $image Resolved image data.
	 * @param string              $alt Accessible description.
	 * @param string              $position Before/after marker.
	 */
	private function comparison_image( array $image, string $alt, string $position ): string {
		return '<img data-blx-comparison-' . $position . ' src="' . Escape::url( $image['url'] ) . '" width="' . (int) ( $image['width'] ?? 0 ) . '" height="' . (int) ( $image['height'] ?? 0 ) . '" alt="' . Escape::attr( $alt ) . '" loading="lazy" decoding="async">';
	}

	/** Render only attachment-backed video or audio with a validated MIME type.
	 *
	 * @param ElementNode $node Element input.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $kind Either video or audio.
	 */
	private function render_playable_media( ElementNode $node, string $hooks, string $kind ): string {
		if ( ! $this->media instanceof PlayableMediaResolver ) {
			return '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		$attachment_id = $this->attachment_id( $node->value( 'src', $node->value( 'attachmentId' ) ) );
		if ( null === $attachment_id ) {
			return '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		$source = $this->media->resolve_playable( $attachment_id, $kind );
		if ( ! is_array( $source ) || ! is_string( $source['url'] ?? null ) || ! SafeUrl::accepts( $source['url'] ) || ! is_string( $source['mime'] ?? null ) || ! \Blixis\Builder\Media\PlayableMediaPolicy::allows( $kind, $source['mime'] ) ) {
			return '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		if ( 'video-background' === preg_replace( '~^blixis/~', '', $node->type ) ) {
			return $this->render_video_background( $node, $hooks, $source );
		}
		$controls = true === $node->value( 'controls', true );
		$autoplay = true === $node->value( 'autoplay', false );
		$loop     = true === $node->value( 'loop', false );
		$muted    = $autoplay || true === $node->value( 'muted', false );
		$preload  = $node->value( 'preload', 'metadata' );
		$preload  = in_array( $preload, [ 'none', 'metadata', 'auto' ], true ) ? $preload : 'metadata';
		$label    = $node->value( 'ariaLabel', '' );
		$attrs    = ( $controls ? ' controls' : '' )
			. ( $autoplay ? ' autoplay' : '' )
			. ( $loop ? ' loop' : '' )
			. ( $muted ? ' muted' : '' )
			. ' preload="' . $preload . '"'
			. ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' );
		if ( 'video' === $kind ) {
			$poster_id = $this->attachment_id( $node->value( 'poster' ) );
			$poster    = null === $poster_id ? null : $this->media->resolve( $poster_id );
			if ( is_array( $poster ) && is_string( $poster['url'] ?? null ) && SafeUrl::accepts( $poster['url'] ) ) {
				$attrs .= ' poster="' . Escape::url( $poster['url'] ) . '"';
			}
		}
		$track = '';
		if ( 'video' === $kind && $this->media instanceof TextTrackResolver ) {
			$caption_id = $this->attachment_id( $node->value( 'captionTrack' ) );
			$captions   = null === $caption_id ? null : $this->media->resolve_text_track( $caption_id );
			if ( is_array( $captions ) && is_string( $captions['url'] ?? null ) && SafeUrl::accepts( $captions['url'] ) ) {
				$site_locale = function_exists( 'get_locale' ) ? (string) get_locale() : 'en';
				$language    = strtolower( (string) strtok( str_replace( '_', '-', $site_locale ), '-' ) );
				$language    = 1 === preg_match( '/^[a-z]{2,3}$/D', $language ) ? $language : 'en';
				$track       = '<track kind="captions" src="' . Escape::url( $captions['url'] ) . '" srclang="' . $language . '" label="' . Escape::attr( __( 'Captions', 'blixis-builder' ) ) . '">';
			}
		}
		return '<' . $kind . $hooks . $attrs . '><source src="' . Escape::url( $source['url'] ) . '" type="' . Escape::attr( $source['mime'] ) . '">' . $track . '</' . $kind . '>';
	}

	/** Render a decorative background video with a poster and accessible fallback.
	 *
	 * @param ElementNode                   $node   Element input.
	 * @param string                        $hooks  Validated element hooks.
	 * @param array{url:string,mime:string} $source Validated video attachment.
	 */
	private function render_video_background( ElementNode $node, string $hooks, array $source ): string {
		$poster_id = $this->attachment_id( $node->value( 'poster' ) );
		$poster    = null === $poster_id ? null : $this->media->resolve( $poster_id );
		$poster    = is_array( $poster ) && is_string( $poster['url'] ?? null ) && SafeUrl::accepts( $poster['url'] ) ? ' poster="' . Escape::url( $poster['url'] ) . '"' : '';
		$label     = $node->value( 'ariaLabel', '' );
		$label     = is_string( $label ) ? trim( $label ) : '';
		$controls  = true === $node->value( 'controls', false );
		$autoplay  = true === $node->value( 'autoplay', false );
		$loop      = true === $node->value( 'loop', false );
		$muted     = $autoplay || true === $node->value( 'muted', true );
		$preload   = $node->value( 'preload', 'metadata' );
		$preload   = in_array( $preload, [ 'none', 'metadata', 'auto' ], true ) ? $preload : 'metadata';
		$attrs     = ( $controls ? ' controls' : '' ) . ( $autoplay ? ' autoplay' : '' ) . ( $loop ? ' loop' : '' ) . ( $muted ? ' muted' : '' ) . ' playsinline preload="' . $preload . '"';
		$attrs    .= ( '' !== $label ? ' aria-label="' . Escape::attr( $label ) . '"' : ( $controls ? '' : ' aria-hidden="true" tabindex="-1"' ) );
		return '<video' . $hooks . $attrs . $poster . '><source src="' . Escape::url( $source['url'] ) . '" type="' . Escape::attr( $source['mime'] ) . '"></video>';
	}

	/** Render a sandboxed external frame with a direct-link fallback.
	 *
	 * @param ElementNode $node Element input.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $kind Element identifier.
	 */
	private function render_external_frame( ElementNode $node, string $hooks, string $kind ): string {
		$url   = $node->value( 'url', '' );
		$title = $node->value( 'title', __( 'Embedded content', 'blixis-builder' ) );
		$url   = is_string( $url ) && SafeUrl::accepts( $url ) ? $url : '';
		$title = is_string( $title ) && '' !== trim( $title ) ? trim( $title ) : __( 'Embedded content', 'blixis-builder' );
		if ( '' === $url || ( 'pdf-viewer' === $kind && 1 !== preg_match( '/\\.pdf(?:$|[?#])/i', $url ) ) ) {
			return '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		$height = 'pdf-viewer' === $kind ? 'height="640"' : '';
		$iframe = '<iframe src="' . Escape::url( $url ) . '" title="' . Escape::attr( $title ) . '" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-presentation" ' . $height . '></iframe>';
		return '<figure' . $hooks . ' data-blx-external-frame>' . $iframe . '<figcaption><a href="' . Escape::url( $url ) . '" target="_blank" rel="noopener noreferrer">' . Escape::html( $title ) . '</a></figcaption></figure>';
	}

	/** Render a consent-aware map with a link-only fallback.
	 *
	 * @param ElementNode $node Element input.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_map( ElementNode $node, string $hooks ): string {
		$center = $node->value( 'center', [] );
		$lat    = is_array( $center ) && is_numeric( $center['lat'] ?? null ) ? (float) $center['lat'] : 0.0;
		$lng    = is_array( $center ) && is_numeric( $center['lng'] ?? null ) ? (float) $center['lng'] : 0.0;
		if ( ! is_finite( $lat ) || $lat < -90 || $lat > 90 ) {
			$lat = 0.0;
		}
		if ( ! is_finite( $lng ) || $lng < -180 || $lng > 180 ) {
			$lng = 0.0;
		}
		$zoom           = $node->value( 'zoom', 12 );
		$zoom           = is_numeric( $zoom ) ? max( 1, min( 19, (int) $zoom ) ) : 12;
		$provider       = $node->value( 'provider', 'openstreetmap' );
		$provider       = in_array( $provider, [ 'openstreetmap', 'google', 'mapbox' ], true ) ? $provider : 'openstreetmap';
		$coords         = sprintf( '%.6F,%.6F', $lat, $lng );
		$map_url        = 'openstreetmap' === $provider
			? sprintf( 'https://www.openstreetmap.org/?mlat=%.6F&mlon=%.6F#map=%d/%.6F/%.6F', $lat, $lng, $zoom, $lat, $lng )
			: ( 'google' === $provider ? 'https://maps.google.com/?q=' . rawurlencode( $coords ) . '&z=' . $zoom : 'https://www.mapbox.com/maps/?center=' . rawurlencode( $coords ) . '&zoom=' . $zoom );
		$longitude_span = 360 / ( 2 ** $zoom );
		$latitude_span  = 180 / ( 2 ** $zoom );
		$bbox           = sprintf( '%.6F,%.6F,%.6F,%.6F', max( -180, $lng - $longitude_span / 2 ), max( -90, $lat - $latitude_span / 2 ), min( 180, $lng + $longitude_span / 2 ), min( 90, $lat + $latitude_span / 2 ) );
		$embed_url      = 'openstreetmap' === $provider
			? 'https://www.openstreetmap.org/export/embed.html?layer=mapnik&bbox=' . rawurlencode( $bbox ) . '&marker=' . rawurlencode( $coords )
			: ( 'google' === $provider ? 'https://maps.google.com/maps?q=' . rawurlencode( $coords ) . '&z=' . $zoom . '&output=embed' : '' );
		$title          = $node->value( 'ariaLabel', __( 'Map', 'blixis-builder' ) );
		$title          = is_string( $title ) && '' !== trim( $title ) ? trim( $title ) : __( 'Map', 'blixis-builder' );
		$button         = '<button type="button" data-blx-map-load aria-expanded="false" data-blx-map-src="' . Escape::attr( $embed_url ) . '" data-blx-map-title="' . Escape::attr( $title ) . '">' . Escape::html( __( 'Load map', 'blixis-builder' ) ) . '</button>';
		$link           = '<a href="' . Escape::url( $map_url ) . '" target="_blank" rel="noopener noreferrer">' . Escape::html( __( 'Open map in a new tab', 'blixis-builder' ) ) . '</a>';
		$locations      = $this->render_map_markers( $node->value( 'markers', [] ) );
		if ( '' === $embed_url ) {
			return '<figure' . $hooks . ' data-blx-map>' . $link . $locations . '</figure>';
		}
		if ( true === $node->value( 'consentRequired', true ) ) {
			return '<figure' . $hooks . ' data-blx-map>' . $button . $link . $locations . '</figure>';
		}
		return '<figure' . $hooks . ' data-blx-map><iframe class="blx-map-frame" src="' . Escape::url( $embed_url ) . '" title="' . Escape::attr( $title ) . '" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin" allowfullscreen></iframe>' . $link . $locations . '</figure>';
	}

	/** Render bounded, accessible location links for map markers.
	 *
	 * @param mixed $markers Marker data.
	 */
	private function render_map_markers( mixed $markers ): string {
		if ( ! is_array( $markers ) || [] === $markers ) {
			return '';
		}
		$items = [];
		foreach ( array_slice( $markers, 0, 50 ) as $index => $marker ) {
			if ( ! is_array( $marker ) || ! is_numeric( $marker['lat'] ?? null ) || ! is_numeric( $marker['lng'] ?? null ) ) {
				continue;
			}
			$lat = (float) $marker['lat'];
			$lng = (float) $marker['lng'];
			if ( ! is_finite( $lat ) || $lat < -90 || $lat > 90 || ! is_finite( $lng ) || $lng < -180 || $lng > 180 ) {
				continue;
			}
			/* translators: %d: marker number in the list. */
			$label = $marker['label'] ?? sprintf( __( 'Location %d', 'blixis-builder' ), $index + 1 );
			if ( ! is_string( $label ) || '' === trim( $label ) ) {
				/* translators: %d: marker number in the list. */
				$label = sprintf( __( 'Location %d', 'blixis-builder' ), $index + 1 );
			}
			$url     = sprintf( 'https://www.openstreetmap.org/?mlat=%.6F&mlon=%.6F#map=16/%.6F/%.6F', $lat, $lng, $lat, $lng );
			$items[] = '<li><a href="' . Escape::url( $url ) . '" target="_blank" rel="noopener noreferrer">' . Escape::html( trim( $label ) ) . '</a></li>';
		}
		return [] === $items ? '' : '<ul aria-label="' . Escape::attr( __( 'Map locations', 'blixis-builder' ) ) . '">' . implode( '', $items ) . '</ul>';
	}

	/** Render image hotspots with visible pins and a keyboard-accessible destination list.
	 *
	 * @param ElementNode $node Element input.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_image_hotspots( ElementNode $node, string $hooks ): string {
		$image = $this->asset_image( $node, false );
		if ( '' === $image ) {
			return '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		$hotspots = $node->value( 'hotspots', [] );
		$hotspots = is_array( $hotspots ) && array_is_list( $hotspots ) ? array_slice( $hotspots, 0, 32 ) : [];
		$pins     = [];
		$links    = [];
		foreach ( $hotspots as $index => $hotspot ) {
			if ( ! is_array( $hotspot ) || ! is_numeric( $hotspot['x'] ?? null ) || ! is_numeric( $hotspot['y'] ?? null ) ) {
				continue;
			}
			$x     = (float) $hotspot['x'];
			$y     = (float) $hotspot['y'];
			$label = $hotspot['label'] ?? '';
			if ( ! is_finite( $x ) || ! is_finite( $y ) || ! is_string( $label ) || '' === trim( $label ) ) {
				continue;
			}
			$x        = max( 0, min( 100, $x ) );
			$y        = max( 0, min( 100, $y ) );
			$x        = rtrim( rtrim( number_format( $x, 2, '.', '' ), '0' ), '.' );
			$y        = rtrim( rtrim( number_format( $y, 2, '.', '' ), '0' ), '.' );
			$position = '--blx-hotspot-x:' . $x . '%;--blx-hotspot-y:' . $y . '%';
			$pins[]   = '<li aria-hidden="true" style="' . Escape::attr( $position ) . '"><span>' . ( $index + 1 ) . '</span></li>';
			$href     = $hotspot['href'] ?? '';
			$links[]  = '<li>' . ( is_string( $href ) && SafeUrl::accepts( $href ) ? '<a href="' . Escape::url( $href ) . '">' . Escape::html( trim( $label ) ) . '</a>' : Escape::html( trim( $label ) ) ) . '</li>';
		}
		$alt     = $node->value( 'alt', '' );
		$alt     = is_string( $alt ) ? $alt : '';
		$caption = $node->value( 'caption', '' );
		$caption = is_string( $caption ) ? $caption : '';
		$html    = '<figure' . $hooks . ' data-blx-image-hotspots><div class="blx-hotspots-canvas">' . $image . ( [] === $pins ? '' : '<ol aria-hidden="true">' . implode( '', $pins ) . '</ol>' ) . '</div>';
		if ( [] !== $links ) {
			$html .= '<ol aria-label="' . Escape::attr( __( 'Image hotspot locations', 'blixis-builder' ) ) . '">' . implode( '', $links ) . '</ol>';
		}
		if ( '' !== $caption ) {
			$html .= '<figcaption>' . Escape::html( $caption ) . '</figcaption>';
		}
		return $html . '</figure>';
	}

	/** Render a keyboard and touch-operable horizontal panorama with a static image fallback.
	 *
	 * @param ElementNode $node Element input.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_panorama( ElementNode $node, string $hooks ): string {
		$image = $this->asset_image( $node, false );
		if ( '' === $image ) {
			return '<div' . $hooks . ' data-blx-missing-media></div>';
		}
		$label   = $node->value( 'ariaLabel', __( '360 degree panorama', 'blixis-builder' ) );
		$label   = is_string( $label ) && '' !== trim( $label ) ? trim( $label ) : __( '360 degree panorama', 'blixis-builder' );
		$id      = 'blx-panorama-instructions-' . preg_replace( '/[^a-zA-Z0-9_-]/', '-', $node->id );
		$html    = '<figure' . $hooks . ' data-blx-panorama><div tabindex="0" role="region" aria-label="' . Escape::attr( $label ) . '" aria-describedby="' . Escape::attr( $id ) . '" data-blx-panorama-viewer>' . $image . '</div>';
		$html   .= '<p id="' . Escape::attr( $id ) . '" data-blx-panorama-instructions>' . Escape::html( __( 'Use the Left and Right Arrow keys to explore the panorama.', 'blixis-builder' ) ) . '</p>';
		$caption = $node->value( 'caption', '' );
		return $html . ( is_string( $caption ) && '' !== $caption ? '<figcaption>' . Escape::html( $caption ) . '</figcaption>' : '' ) . '</figure>';
	}

	/** Parse only positive media attachment IDs or explicit attachment references.
	 *
	 * @param mixed $value Saved media reference.
	 */
	private function attachment_id( mixed $value ): ?int {
		if ( is_int( $value ) && $value > 0 ) {
			return $value;
		}
		if ( is_string( $value ) && 1 === preg_match( '/^(?:attachment:|media:)?([1-9][0-9]{0,8})$/D', $value, $matches ) ) {
			return (int) $matches[1];
		}
		return null;
	}

	/** Render a static gallery from approved image asset references.
	 *
	 * @param ElementNode $node Gallery element.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_gallery( ElementNode $node, string $hooks ): string {
		$assets   = $node->value( 'assets', [] );
		$assets   = is_array( $assets ) ? array_slice( $assets, 0, 32 ) : [];
		$columns  = $node->value( 'columns', 3 );
		$columns  = is_numeric( $columns ) ? max( 1, min( 6, (int) $columns ) ) : 3;
		$label    = $node->value( 'ariaLabel', 'Image gallery' );
		$lightbox = 'blixis/lightbox' === $node->type || true === $node->value( 'lightbox', false );
		$gallery  = in_array( $node->type, [ 'blixis/gallery', 'blixis/lightbox' ], true ) ? ' data-blx-gallery' : '';
		$html     = '<div' . $hooks . $gallery . ' data-blx-columns="' . $columns . '"' . ( $lightbox ? ' data-blx-lightbox-gallery data-blx-lightbox-label="' . Escape::attr( __( 'Image preview', 'blixis-builder' ) ) . '" data-blx-lightbox-close="' . Escape::attr( __( 'Close image preview', 'blixis-builder' ) ) . '"' : '' ) . ( is_string( $label ) && '' !== trim( $label ) ? ' role="group" aria-label="' . Escape::attr( $label ) . '"' : '' ) . '><ul>';
		foreach ( $assets as $reference ) {
			if ( ! is_string( $reference ) ) {
				continue;
			}
			$image = $this->resolve_image_reference( $reference );
			if ( ! is_array( $image ) || ! is_string( $image['url'] ?? null ) || ! SafeUrl::accepts( $image['url'] ) ) {
				continue;
			}
			$alt    = is_string( $image['alt'] ?? null ) ? $image['alt'] : '';
			$srcset = is_string( $image['srcset'] ?? null ) ? \Blixis\Builder\Media\MediaPolicy::srcset( $image['srcset'] ) : null;
			$sizes  = null !== $srcset && is_string( $image['sizes'] ?? null ) ? \Blixis\Builder\Media\MediaPolicy::sizes( $image['sizes'] ) : null;
			$img    = '<img src="' . Escape::url( $image['url'] ) . '"' . ( null === $srcset ? '' : ' srcset="' . Escape::attr( $srcset ) . '"' ) . ( null === $sizes ? '' : ' sizes="' . Escape::attr( $sizes ) . '"' ) . ' width="' . (int) ( $image['width'] ?? 0 ) . '" height="' . (int) ( $image['height'] ?? 0 ) . '" alt="' . Escape::attr( $alt ) . '" loading="lazy" decoding="async">';
			$html  .= '<li>' . ( $lightbox ? '<a href="' . Escape::url( $image['url'] ) . '" data-blx-lightbox-trigger aria-label="' . Escape::attr( '' !== $alt ? $alt : __( 'Open image', 'blixis-builder' ) ) . '">' . $img . '</a>' : $img );
			if ( true === $node->value( 'captions', false ) && '' !== $alt ) {
				$html .= '<figcaption>' . Escape::html( $alt ) . '</figcaption>';
			}
			$html .= '</li>';
		}
		return $html . '</ul></div>';
	}

	/** Render the site's native WordPress search form with a same-origin GET destination.
	 *
	 * @param ElementNode $node Search element.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_site_search( ElementNode $node, string $hooks ): string {
		$label       = $node->value( 'ariaLabel', $this->translate_label( 'Search' ) );
		$label       = is_string( $label ) && '' !== trim( $label ) ? trim( $label ) : $this->translate_label( 'Search' );
		$action      = function_exists( 'home_url' ) ? home_url( '/' ) : '/';
		$action      = SafeUrl::accepts( $action ) ? $action : '/';
		$input_id    = 'blx-search-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		$placeholder = $node->value( 'placeholder', $this->translate_label( 'Search' ) . '…' );
		$placeholder = is_string( $placeholder ) && '' !== $placeholder ? ' placeholder="' . Escape::attr( $placeholder ) . '"' : '';
		return '<form' . $hooks . ' role="search" method="get" action="' . Escape::url( $action ) . '"><label for="' . $input_id . '">' . Escape::html( $label ) . '</label><input id="' . $input_id . '" type="search" name="s" value=""' . $placeholder . '><button type="submit">' . Escape::html( $this->translate_label( 'Search' ) ) . '</button></form>';
	}

	/** Render a native POST form with the built-in no-retention admin-email handler.
	 *
	 * @param string      $id Element definition id.
	 * @param ElementNode $node Form element.
	 * @param string      $hooks Validated hooks.
	 * @param string      $children Rendered field markup.
	 * @param bool        $preview Whether to render an inert preview.
	 */
	private function render_form( string $id, ElementNode $node, string $hooks, string $children, bool $preview ): string {
		if ( $preview ) {
			return '<div' . $hooks . ' data-blx-form-preview inert aria-disabled="true">' . $children . '</div>';
		}
		$post_id = function_exists( 'get_the_ID' ) ? (int) get_the_ID() : 0;
		$form_id = $node->value( 'formId', 'contact' );
		$form_id = is_string( $form_id ) && 1 === preg_match( '/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/D', $form_id ) ? ( function_exists( 'sanitize_key' ) ? sanitize_key( $form_id ) : strtolower( $form_id ) ) : 'contact';
		$action  = function_exists( 'admin_url' ) ? admin_url( 'admin-post.php' ) : '/wp-admin/admin-post.php';
		$label   = $node->value( 'ariaLabel' );
		$label   = is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( trim( $label ) ) . '"' : '';
		$fields  = '<input type="hidden" name="action" value="blx_submit_form"><input type="hidden" name="post_id" value="' . $post_id . '"><input type="hidden" name="form_id" value="' . Escape::attr( $form_id ) . '">';
		if ( function_exists( 'wp_nonce_field' ) && $post_id > 0 ) {
			$nonce   = wp_nonce_field( \Blixis\Builder\Rest\FormSubmissionController::nonce_action( $post_id, $form_id ), '_wpnonce', false, false );
			$fields .= is_string( $nonce ) ? $nonce : '';
		}
		$trap   = '<label class="screen-reader-text" aria-hidden="true">' . Escape::html( $this->translate_label( 'Leave this field empty' ) ) . '<input type="text" name="company_website" value="" tabindex="-1" autocomplete="off"></label>';
		$status = isset( $_GET['status'], $_GET['form'] ) && is_string( $_GET['status'] ) && is_string( $_GET['form'] ) && ( function_exists( 'sanitize_key' ) ? sanitize_key( wp_unslash( $_GET['form'] ) ) : strtolower( wp_unslash( $_GET['form'] ) ) ) === $form_id ? ( function_exists( 'sanitize_key' ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : strtolower( wp_unslash( $_GET['status'] ) ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Public result flag only controls a status message.
		if ( in_array( $status, [ 'success', 'error' ], true ) && function_exists( 'nocache_headers' ) ) {
			nocache_headers();
		}
		$type = 'newsletter-signup' === $id ? 'newsletter' : 'contact';
		return '<form' . $hooks . ' method="post" action="' . Escape::url( $action ) . '" data-blx-form="' . $type . '"' . $label . '>' . $fields . $trap . $children . '</form>';
	}

	/** Show only the configured form result, with an accessible status role.
	 *
	 * @param string      $id Success or error element id.
	 * @param ElementNode $node Feedback element.
	 * @param string      $hooks Validated hooks.
	 */
	private function render_form_feedback( string $id, ElementNode $node, string $hooks ): string {
		$status = isset( $_GET['status'] ) && is_string( $_GET['status'] ) ? ( function_exists( 'sanitize_key' ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : strtolower( wp_unslash( $_GET['status'] ) ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Public result flag only controls a status message.
		$target = 'form-success' === $id ? 'success' : 'error';
		if ( $target !== $status ) {
			return '';
		}
		$title       = $node->value( 'title', 'success' === $target ? $this->translate_label( 'Thanks!' ) : $this->translate_label( 'Something went wrong.' ) );
		$description = $node->value( 'description', '' );
		$title       = is_string( $title ) ? $title : '';
		$description = is_string( $description ) ? $description : '';
		$role        = 'success' === $target ? 'status' : 'alert';
		return '<div' . $hooks . ' role="' . $role . '"><strong>' . Escape::html( $title ) . '</strong>' . ( '' !== trim( $description ) ? '<p>' . Escape::html( $description ) . '</p>' : '' ) . '</div>';
	}

	/** Render a keyboard-operable disclosure using native HTML, without JavaScript.
	 *
	 * @param ElementNode $node Show-more element.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $children Already-rendered child markup.
	 */
	private function render_show_more( ElementNode $node, string $hooks, string $children ): string {
		$label = $node->value( 'label', $this->translate_label( 'Show more' ) );
		$label = is_string( $label ) && '' !== trim( $label ) ? trim( $label ) : $this->translate_label( 'Show more' );
		$id    = $node->value( 'htmlId' );
		$id    = is_string( $id ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_:\-.]{0,63}$/D', $id ) ? ' id="' . Escape::attr( $id ) . '"' : '';
		$aria  = $node->value( 'ariaLabel' );
		$aria  = is_string( $aria ) && '' !== trim( $aria ) ? ' aria-label="' . Escape::attr( trim( $aria ) ) . '"' : '';
		return '<details' . $hooks . $id . ( true === $node->value( 'hidden', false ) ? ' hidden' : '' ) . ( true === $node->value( 'defaultOpen', false ) ? ' open' : '' ) . '><summary' . $aria . '>' . Escape::html( $label ) . '</summary>' . $children . '</details>';
	}

	/** Resolve only allowlisted public WordPress fields from the current render context.
	 *
	 * @param ElementNode $node Dynamic definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_dynamic( ElementNode $node, string $hooks ): string {
		$value   = null;
		$type    = preg_replace( '~^blixis/~', '', $node->type );
		$post_id = function_exists( 'get_the_ID' ) ? get_the_ID() : false;
		$binding = $node->value( 'binding' );
		if ( $binding instanceof \stdClass ) {
			$binding = get_object_vars( $binding );
		}
		if ( is_array( $binding ) && is_string( $binding['source'] ?? null ) && is_string( $binding['path'] ?? null ) ) {
			$value = match ( $binding['source'] . ':' . $binding['path'] ) {
				'wordpress-post:post.title' => function_exists( 'get_the_title' ) ? get_the_title() : null,
				'wordpress-post:post.content' => is_int( $post_id ) && $post_id > 0 && function_exists( 'get_post_field' ) ? get_post_field( 'post_content', $post_id ) : null,
				'wordpress-post:post.excerpt' => function_exists( 'get_the_excerpt' ) ? get_the_excerpt() : null,
				'wordpress-post:post.date' => function_exists( 'get_the_date' ) ? get_the_date() : null,
				'wordpress-post:post.author' => function_exists( 'get_the_author' ) ? get_the_author() : null,
				'wordpress-post:post.url' => is_int( $post_id ) && $post_id > 0 && function_exists( 'get_permalink' ) ? get_permalink( $post_id ) : null,
				'wordpress-post:post.slug' => is_int( $post_id ) && $post_id > 0 && function_exists( 'get_post_field' ) ? get_post_field( 'post_name', $post_id ) : null,
				'wordpress-post:post.commentCount' => is_int( $post_id ) && $post_id > 0 && function_exists( 'get_comments_number' ) ? (string) get_comments_number( $post_id ) : null,
				'wordpress-post:post.terms.category' => is_int( $post_id ) && $post_id > 0 && function_exists( 'get_the_terms' ) ? $this->term_names( get_the_terms( $post_id, 'category' ) ) : null,
				'wordpress-site:site.title' => function_exists( 'get_bloginfo' ) ? get_bloginfo( 'name' ) : null,
				'wordpress-site:site.tagline' => function_exists( 'get_bloginfo' ) ? get_bloginfo( 'description' ) : null,
				'wordpress-site:site.url' => function_exists( 'home_url' ) ? home_url( '/' ) : null,
				'wordpress-user:user.displayName' => function_exists( 'get_the_author' ) ? get_the_author() : null,
				'wordpress-user:user.description' => function_exists( 'get_the_author_meta' ) ? get_the_author_meta( 'description' ) : null,
				'wordpress-user:user.url' => function_exists( 'get_the_author_meta' ) ? get_the_author_meta( 'user_url' ) : null,
				default => null,
			};
		}
		if ( 'post-title' === $type && function_exists( 'get_the_title' ) ) {
			$value = $value ?? get_the_title();
		} elseif ( 'post-excerpt' === $type && function_exists( 'get_the_excerpt' ) ) {
			$value = $value ?? get_the_excerpt();
		} elseif ( 'post-content' === $type && function_exists( 'get_post_field' ) && is_int( $post_id ) && $post_id > 0 ) {
			$value = $value ?? get_post_field( 'post_content', $post_id );
		} elseif ( 'post-date' === $type && function_exists( 'get_the_date' ) ) {
			$value = $value ?? get_the_date();
		} elseif ( 'post-author' === $type && function_exists( 'get_the_author' ) ) {
			$value = $value ?? get_the_author();
		} elseif ( 'site-tagline' === $type && function_exists( 'get_bloginfo' ) ) {
			$value = $value ?? get_bloginfo( 'description' );
		} elseif ( 'post-terms' === $type && function_exists( 'get_the_terms' ) && is_int( $post_id ) && $post_id > 0 ) {
			if ( null === $value ) {
				$value = $this->term_names( get_the_terms( $post_id, 'category' ) );
			}
		}
		if ( ! is_string( $value ) || '' === trim( $value ) ) {
			$value = $node->value( 'fallback', '' );
			if ( ( ! is_string( $value ) || '' === trim( $value ) ) && is_array( $binding ) ) {
				$value = $binding['fallback'] ?? $value;
			}
		}
		$value = is_string( $value ) ? $value : '';
		if ( in_array( $type, [ 'post-content', 'post-excerpt' ], true ) && function_exists( 'wp_strip_all_tags' ) ) {
			$value = wp_strip_all_tags( $value );
		}
		$tag = 'post-content' === $type ? 'div' : 'span';
		return '<' . $tag . $hooks . '>' . Escape::html( $value ) . '</' . $tag . '>';
	}

	/** Convert only WordPress terms to a plain text label list.
	 *
	 * @param mixed $terms Term list or error.
	 */
	private function term_names( mixed $terms ): ?string {
		if ( ! is_array( $terms ) ) {
			return null;
		}
		return implode( ', ', array_filter( array_map( static fn ( mixed $term ): string => $term instanceof \WP_Term ? $term->name : '', $terms ) ) );
	}

	/** Render the public current author with an explicit field allowlist.
	 *
	 * @param ElementNode $node Author box.
	 * @param string      $hooks Validated hooks.
	 */
	private function render_author_box( ElementNode $node, string $hooks ): string {
		$author_id = function_exists( 'get_the_author_meta' ) ? (int) get_the_author_meta( 'ID' ) : 0;
		$name      = $author_id > 0 ? (string) get_the_author_meta( 'display_name', $author_id ) : '';
		$bio       = $author_id > 0 ? (string) get_the_author_meta( 'description', $author_id ) : '';
		$title     = $node->value( 'title', '' );
		$href      = $author_id > 0 && function_exists( 'get_author_posts_url' ) ? get_author_posts_url( $author_id ) : '';
		if ( '' === $name ) {
			$name = is_string( $title ) ? $title : '';
		}
		if ( '' === $bio ) {
			$bio = (string) $node->value( 'description', '' );
		}
		$name_html = '' !== $href && true === $node->value( 'interactive', false ) ? '<a href="' . Escape::url( $href ) . '">' . Escape::html( $name ) . '</a>' : Escape::html( $name );
		return '<article' . $hooks . '><h2>' . $name_html . '</h2>' . ( '' !== $bio ? '<p>' . Escape::html( $bio ) . '</p>' : '' ) . '</article>';
	}

	/** Render approved comments for the current post, bounded to 50 entries.
	 *
	 * @param ElementNode $node Comments list.
	 * @param string      $hooks Validated hooks.
	 */
	private function render_comments_list( ElementNode $node, string $hooks ): string {
		$post_id  = function_exists( 'get_the_ID' ) ? (int) get_the_ID() : 0;
		$comments = $post_id > 0 && function_exists( 'get_comments' ) ? get_comments(
			[
				'post_id'      => $post_id,
				'status'       => 'approve',
				'number'       => 50,
				'hierarchical' => false,
			]
		) : [];
		if ( ! is_array( $comments ) || [] === $comments ) {
			$fallback = $node->value( 'fallback', '' );
			return is_string( $fallback ) && '' !== $fallback ? '<div' . $hooks . '>' . Escape::html( $fallback ) . '</div>' : '';
		}
		$html = '<ol' . $hooks . '>';
		foreach ( $comments as $comment ) {
			if ( ! $comment instanceof \WP_Comment || '1' !== (string) $comment->comment_approved ) {
				continue;
			}
			$html .= '<li><article><p>' . Escape::html( (string) $comment->comment_author ) . '</p><div>' . ( function_exists( 'wp_kses_post' ) ? wp_kses_post( (string) $comment->comment_content ) : Escape::html( (string) $comment->comment_content ) ) . '</div></article></li>';
		}
		return $html . '</ol>';
	}

	/** Render a bounded public post query using only public post types and published content.
	 *
	 * @param ElementNode $node Loop definition.
	 * @param string      $hooks Validated hooks.
	 * @param bool        $related Use current post categories.
	 */
	private function render_post_loop( ElementNode $node, string $hooks, bool $related ): string {
		if ( null !== $node->value( 'queryRef' ) ) {
			$empty = $node->value( 'emptyMessage', 'No results' );
			return '<p' . $hooks . '>' . Escape::html( is_string( $empty ) ? $empty : 'No results' ) . '</p>';
		}
		if ( ! function_exists( 'get_posts' ) || ! function_exists( 'get_post_types' ) ) {
			$empty = $node->value( 'emptyMessage', 'No results' );
			return '<p' . $hooks . '>' . Escape::html( is_string( $empty ) ? $empty : 'No results' ) . '</p>';
		}
		$maximum    = $node->value( 'maxItems', 30 );
		$maximum    = is_numeric( $maximum ) ? max( 1, min( 30, (int) $maximum ) ) : 10;
		$requested  = $related ? [ 'post' ] : $node->value( 'allowedPostTypes', [ 'post' ] );
		$public     = get_post_types( [ 'public' => true ], 'names' );
		$post_types = is_array( $requested ) ? array_values( array_intersect( array_filter( $requested, 'is_string' ), $public ) ) : [ 'post' ];
		$post_types = array_slice( $post_types, 0, 10 );
		if ( [] === $post_types ) {
			return '';
		}
		$args = [
			'post_type'        => $post_types,
			'post_status'      => 'publish',
			'numberposts'      => $maximum,
			'orderby'          => 'date',
			'order'            => 'DESC',
			'suppress_filters' => false,
		];
		if ( $related && function_exists( 'wp_get_post_categories' ) ) {
			$categories           = wp_get_post_categories( (int) get_the_ID() );
			$args['post__not_in'] = [ (int) get_the_ID() ];
			$args['category__in'] = is_array( $categories ) ? $categories : [];
		}
		$posts = get_posts( $args );
		if ( ! is_array( $posts ) || [] === $posts ) {
			$empty = $node->value( 'emptyMessage', 'No results' );
			return '<p' . $hooks . '>' . Escape::html( is_string( $empty ) ? $empty : 'No results' ) . '</p>';
		}
		$html = '<ul' . $hooks . '>';
		foreach ( $posts as $post ) {
			if ( ! $post instanceof \WP_Post ) {
				continue;
			}
			$title = get_the_title( $post );
			$url   = get_permalink( $post );
			$html .= '<li><a href="' . Escape::url( is_string( $url ) ? $url : '' ) . '">' . Escape::html( is_string( $title ) ? $title : '' ) . '</a></li>';
		}
		return $html . '</ul>';
	}

	/** Render pagination links from bounded numeric settings.
	 *
	 * @param ElementNode $node Pagination definition.
	 * @param string      $hooks Validated hooks.
	 */
	private function render_query_pagination( ElementNode $node, string $hooks ): string {
		$current = $node->value( 'currentPage', 1 );
		$total   = $node->value( 'total', 1 );
		$current = is_numeric( $current ) ? max( 1, (int) $current ) : 1;
		$total   = is_numeric( $total ) ? max( 1, min( 1000, (int) $total ) ) : 1;
		if ( $total < 2 ) {
			return '';
		}
		$base  = $node->value( 'basePath', '' );
		$base  = is_string( $base ) && SafeUrl::accepts( $base ) ? $base : ( function_exists( 'get_pagenum_link' ) ? get_pagenum_link( 1 ) : '/' );
		$html  = '<nav' . $hooks . ' aria-label="' . Escape::attr( $this->translate_label( 'Pagination' ) ) . '"><ul>';
		$start = max( 1, $current - 2 );
		$end   = min( $total, $current + 2 );
		for ( $page = $start; $page <= $end; $page++ ) {
			$url   = function_exists( 'add_query_arg' ) ? add_query_arg( 'paged', $page, $base ) : $base;
			$html .= '<li>' . ( $page === $current ? '<span aria-current="page">' . $page . '</span>' : '<a href="' . Escape::url( $url ) . '">' . $page . '</a>' ) . '</li>';
		}
		return $html . '</ul></nav>';
	}

	/** Render a static alert with semantic live-region behavior.
	 *
	 * @param ElementNode $node Alert definition.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $children Rendered child content.
	 */
	private function render_alert( ElementNode $node, string $hooks, string $children ): string {
		$title       = $node->value( 'title', '' );
		$description = $node->value( 'description', '' );
		$variant     = $node->value( 'variant', 'info' );
		$role        = in_array( $variant, [ 'error', 'danger', 'destructive' ], true ) ? 'alert' : 'status';
		$html        = '<div' . $hooks . ' role="' . $role . '">';
		if ( is_string( $title ) && '' !== $title ) {
			$html .= '<strong>' . Escape::html( $title ) . '</strong>';
		}
		if ( is_string( $description ) && '' !== $description ) {
			$html .= '<p>' . Escape::html( $description ) . '</p>';
		}
		return $html . $children . '</div>';
	}

	/** Render a native progress indicator with bounded numeric values.
	 *
	 * @param ElementNode $node Progress definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_progress( ElementNode $node, string $hooks ): string {
		$value    = $node->value( 'value', 0 );
		$max      = $node->value( 'max', 100 );
		$value    = is_numeric( $value ) ? (float) $value : 0;
		$max      = is_numeric( $max ) && (float) $max > 0 ? (float) $max : 100;
		$value    = max( 0, min( $max, $value ) );
		$label    = $node->value( 'ariaLabel' );
		$progress = '<progress' . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . ' value="' . $value . '" max="' . $max . '"></progress>';
		if ( true === $node->value( 'showLabel', false ) ) {
			$percent = (int) round( 100 * $value / $max );
			return '<div' . $hooks . '>' . $progress . '<span>' . $percent . '%</span></div>';
		}
		return '<progress' . $hooks . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . ' value="' . $value . '" max="' . $max . '"></progress>';
	}

	/** Render a bounded, script-free progress ring.
	 *
	 * @param ElementNode $node Ring definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_progress_ring( ElementNode $node, string $hooks ): string {
		$value   = $node->value( 'value', 0 );
		$max     = $node->value( 'max', 100 );
		$value   = is_numeric( $value ) && is_finite( (float) $value ) ? (float) $value : 0;
		$max     = is_numeric( $max ) && is_finite( (float) $max ) && (float) $max > 0 ? min( 1000000, (float) $max ) : 100;
		$value   = max( 0, min( $max, $value ) );
		$percent = round( 100 * $value / $max, 2 );
		$label   = $node->value( 'ariaLabel' );
		$label   = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Progress' );
		$visible = true === $node->value( 'showLabel', true ) ? '<span>' . (int) round( $percent ) . '%</span>' : '';
		return '<div' . $hooks . ' data-blx-progress-ring role="progressbar" aria-label="' . Escape::attr( $label ) . '" aria-valuemin="0" aria-valuemax="' . Escape::attr( sprintf( '%g', $max ) ) . '" aria-valuenow="' . Escape::attr( sprintf( '%g', $value ) ) . '"><svg aria-hidden="true" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" pathLength="100" fill="none" stroke="currentColor" opacity="0.2" stroke-width="4"></circle><circle cx="24" cy="24" r="20" pathLength="100" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="' . Escape::attr( sprintf( '%g', $percent ) ) . ' 100" transform="rotate(-90 24 24)"></circle></svg>' . $visible . '</div>';
	}

	/** Render disclosure sections with native keyboard and no-script behavior.
	 *
	 * @param ElementNode $node Accordion definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_accordion( ElementNode $node, string $hooks ): string {
		$items       = $node->value( 'items', [] );
		$items       = is_array( $items ) ? array_slice( $items, 0, 100 ) : [];
		$open        = $node->value( 'defaultOpen', [] );
		$open        = is_array( $open ) ? $open : [];
		$multiple    = true === $node->value( 'multiple', false );
		$collapsible = true === $node->value( 'collapsible', true );
		$label       = $node->value( 'ariaLabel' );
		$attributes  = is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '';
		$attributes .= ' data-blx-accordion data-blx-accordion-multiple="' . ( $multiple ? 'true' : 'false' ) . '" data-blx-accordion-collapsible="' . ( $collapsible ? 'true' : 'false' ) . '"';
		$group       = 'blx-accordion-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		$available   = [];
		foreach ( $items as $candidate ) {
			$candidate = $this->record( $candidate );
			if ( is_string( $candidate['id'] ?? null ) ) {
				$available[] = $candidate['id'];
			}
		}
		$open = array_values( array_intersect( $open, $available ) );
		if ( ! $multiple ) {
			$open = array_slice( $open, 0, 1 );
		}
		if ( ! $collapsible && [] === $open && isset( $available[0] ) ) {
			$open[] = $available[0];
		}
		$html   = '<div' . $hooks . $attributes . '>';
		$opened = false;
		foreach ( $items as $item ) {
			$item = $this->record( $item );
			if ( null === $item ) {
				continue;
			}
			$id      = $item['id'] ?? '';
			$title   = $item['title'] ?? $item['label'] ?? '';
			$content = $item['content'] ?? '';
			if ( ! is_string( $title ) || ! is_string( $content ) ) {
				continue;
			}
			$is_open = is_string( $id ) && in_array( $id, $open, true ) && ( $multiple || ! $opened );
			$opened  = $opened || $is_open;
			$html   .= '<details' . ( $multiple ? '' : ' name="' . Escape::attr( $group ) . '"' ) . ( $is_open ? ' open' : '' ) . '><summary>' . Escape::html( $title ) . '</summary><div>' . Escape::html( $content ) . '</div></details>';
		}
		return $html . '</div>';
	}

	/** Render an off-canvas disclosure that the runtime upgrades to a modal when requested.
	 *
	 * @param ElementNode $node Off-canvas definition.
	 * @param string      $children Validated child markup.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_offcanvas( ElementNode $node, string $children, string $hooks ): string {
		$placement = $node->value( 'placement', 'right' );
		$placement = in_array( $placement, [ 'top', 'bottom', 'left', 'right' ], true ) ? $placement : 'right';
		$open_on   = $node->value( 'openOn', 'click' );
		$open_on   = in_array( $open_on, [ 'click', 'hover', 'focus', 'manual' ], true ) ? $open_on : 'click';
		$animation = $node->value( 'animationPreset', 'fade' );
		$animation = in_array( $animation, [ 'none', 'fade', 'scale', 'slide' ], true ) ? $animation : 'fade';
		$label     = $node->value( 'ariaLabel' );
		$label     = is_string( $label ) && '' !== trim( $label ) ? trim( $label ) : $this->translate_label( 'Off-canvas panel' );
		$trigger   = $node->value( 'triggerLabel', $this->translate_label( 'Open' ) );
		$trigger   = is_string( $trigger ) && '' !== trim( $trigger ) ? trim( $trigger ) : $this->translate_label( 'Open' );
		$modal     = true === $node->value( 'modal', false );
		return '<details' . $hooks . ' data-blx-offcanvas data-blx-offcanvas-placement="' . Escape::attr( $placement ) . '" data-blx-offcanvas-open-on="' . Escape::attr( $open_on ) . '" data-blx-offcanvas-animation="' . Escape::attr( $animation ) . '" data-blx-offcanvas-modal="' . ( $modal ? 'true' : 'false' ) . '" data-blx-offcanvas-close-escape="' . ( true === $node->value( 'closeOnEscape', true ) ? 'true' : 'false' ) . '" data-blx-offcanvas-close-outside="' . ( true === $node->value( 'closeOnOutside', true ) ? 'true' : 'false' ) . '" data-blx-offcanvas-label="' . Escape::attr( $label ) . '"><summary>' . Escape::html( $trigger ) . '</summary><div data-blx-offcanvas-panel tabindex="-1"><button type="button" data-blx-offcanvas-close aria-label="' . Escape::attr( $this->translate_label( 'Close panel' ) ) . '">×</button>' . $children . '</div></details>';
	}

	/** Render accessible native input and choice components with escaped labels and bounded option lists.
	 *
	 * @param string      $id Element id.
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_ui_control( string $id, ElementNode $node, string $hooks ): string {
		$label         = $node->value( 'label', $this->translate_label( 'Select option' ) );
		$label         = is_string( $label ) && '' !== trim( $label ) ? trim( $label ) : $this->translate_label( 'Select option' );
		$name          = $node->value( 'name', 'blixis-choice' );
		$name          = is_string( $name ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/D', $name ) ? $name : 'blixis-choice';
		$disabled      = true === $node->value( 'disabled', false );
		$required      = true === $node->value( 'required', false );
		$state         = true === $node->value( 'checked', false );
		$options       = $node->value( 'options', [] );
		$options       = is_array( $options ) ? array_slice( $options, 0, 100 ) : [];
		$value         = $node->value( 'defaultValue' );
		$value         = is_string( $value ) ? $value : '';
		$disabled_attr = $disabled ? ' disabled' : '';

		if ( in_array( $id, [ 'switch', 'checkbox' ], true ) ) {
			return '<label' . $hooks . '><input type="checkbox"' . ( 'switch' === $id ? ' role="switch"' : '' ) . ' name="' . Escape::attr( $name ) . '" value="1"' . ( $state ? ' checked' : '' ) . ( $required ? ' required' : '' ) . $disabled_attr . '> ' . Escape::html( $label ) . '</label>';
		}
		if ( 'toggle' === $id ) {
			return '<button' . $hooks . ' type="button" aria-pressed="' . ( $state ? 'true' : 'false' ) . '" data-blx-toggle' . $disabled_attr . '>' . Escape::html( $label ) . '</button>';
		}
		if ( in_array( $id, [ 'toggle-group', 'segmented-control' ], true ) ) {
			$html = '<fieldset' . $hooks . '><legend>' . Escape::html( $label ) . '</legend>';
			foreach ( $options as $index => $candidate ) {
				$candidate    = $this->record( $candidate );
				$option_value = $candidate['value'] ?? null;
				$option_label = $candidate['label'] ?? null;
				if ( ! is_string( $option_value ) || ! is_string( $option_label ) ) {
					continue;
				}
				$option_id = 'blx-option-' . substr( hash( 'sha256', $node->id . ':' . (string) $index ), 0, 12 );
				$html     .= '<label for="' . $option_id . '"><input id="' . $option_id . '" type="radio" name="' . Escape::attr( $name ) . '" value="' . Escape::attr( $option_value ) . '"' . ( $option_value === $value ? ' checked' : '' ) . $disabled_attr . '> ' . Escape::html( $option_label ) . '</label>';
			}
			return $html . '</fieldset>';
		}
		if ( 'radio-group' === $id ) {
			$html = '<fieldset' . $hooks . '><legend>' . Escape::html( $label ) . '</legend>';
			foreach ( $options as $index => $candidate ) {
				$candidate    = $this->record( $candidate );
				$option_value = $candidate['value'] ?? null;
				$option_label = $candidate['label'] ?? null;
				if ( ! is_string( $option_value ) || ! is_string( $option_label ) ) {
					continue;
				}
				$option_id = 'blx-option-' . substr( hash( 'sha256', $node->id . ':' . (string) $index ), 0, 12 );
				$html     .= '<label for="' . $option_id . '"><input id="' . $option_id . '" type="radio" name="' . Escape::attr( $name ) . '" value="' . Escape::attr( $option_value ) . '"' . ( $option_value === $value ? ' checked' : '' ) . ( $required ? ' required' : '' ) . $disabled_attr . '> ' . Escape::html( $option_label ) . '</label>';
			}
			return $html . '</fieldset>';
		}
		if ( in_array( $id, [ 'select', 'combobox' ], true ) ) {
			$control_id = 'blx-control-' . substr( hash( 'sha256', $node->id ), 0, 12 );
			$html       = '<label for="' . $control_id . '">' . Escape::html( $label ) . '</label><select' . $hooks . ' id="' . $control_id . '" name="' . Escape::attr( $name ) . '"' . ( $required ? ' required' : '' ) . $disabled_attr . '>';
			if ( true === $node->value( 'allowClear', false ) ) {
				$html .= '<option value=""' . ( '' === $value ? ' selected' : '' ) . '>' . Escape::html( $this->translate_label( 'Select option' ) ) . '</option>';
			}
			foreach ( $options as $candidate ) {
				$candidate    = $this->record( $candidate );
				$option_value = $candidate['value'] ?? null;
				$option_label = $candidate['label'] ?? null;
				if ( ! is_string( $option_value ) || ! is_string( $option_label ) ) {
					continue;
				}
				$html .= '<option value="' . Escape::attr( $option_value ) . '"' . ( $option_value === $value ? ' selected' : '' ) . '>' . Escape::html( $option_label ) . '</option>';
			}
			return $html . '</select>';
		}
		if ( in_array( $id, [ 'input', 'textarea', 'date-picker' ], true ) ) {
			$control_id  = 'blx-field-' . substr( hash( 'sha256', $node->id ), 0, 12 );
			$value       = $node->value( 'value', '' );
			$value       = is_string( $value ) ? $value : '';
			$placeholder = $node->value( 'placeholder', '' );
			$placeholder = is_string( $placeholder ) ? ' placeholder="' . Escape::attr( $placeholder ) . '"' : '';
			$error       = $node->value( 'errorMessage', '' );
			$error       = is_string( $error ) && '' !== trim( $error ) ? trim( $error ) : '';
			$error_id    = $control_id . '-error';
			$attributes  = ' id="' . $control_id . '" name="' . Escape::attr( $name ) . '"' . ( $required ? ' required' : '' ) . $disabled_attr . $placeholder . ( '' !== $error ? ' aria-invalid="true" aria-describedby="' . $error_id . '"' : '' );
			$label_html  = '<label for="' . $control_id . '">' . Escape::html( $label ) . '</label>';
			if ( 'textarea' === $id ) {
				return $label_html . '<textarea' . $hooks . $attributes . '>' . Escape::html( $value ) . '</textarea>' . ( '' !== $error ? '<p id="' . $error_id . '">' . Escape::html( $error ) . '</p>' : '' );
			}
			$type          = 'date-picker' === $id ? 'date' : $node->value( 'inputType', 'text' );
			$allowed_types = [ 'text', 'email', 'password', 'tel', 'url', 'number', 'search', 'date', 'time' ];
			$type          = is_string( $type ) && in_array( $type, $allowed_types, true ) ? $type : 'text';
			$min_date      = $node->value( 'minDate' );
			$max_date      = $node->value( 'maxDate' );
			$bounds        = '';
			foreach ( [
				'min' => $min_date,
				'max' => $max_date,
			] as $bound_name => $bound_value ) {
				if ( is_string( $bound_value ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/D', $bound_value ) ) {
					$bounds .= ' ' . $bound_name . '="' . Escape::attr( $bound_value ) . '"';
				}
			}
			return $label_html . '<input' . $hooks . ' type="' . $type . '"' . $attributes . $bounds . ' value="' . Escape::attr( $value ) . '">' . ( '' !== $error ? '<p id="' . $error_id . '">' . Escape::html( $error ) . '</p>' : '' );
		}
		$field_types = [
			'text-field'     => 'text',
			'email-field'    => 'email',
			'password-field' => 'password',
			'number-field'   => 'number',
			'url-field'      => 'url',
			'search-field'   => 'search',
			'hidden-field'   => 'hidden',
		];
		if ( isset( $field_types[ $id ] ) ) {
			$control_id          = 'blx-field-' . substr( hash( 'sha256', $node->id ), 0, 12 );
			$field_type          = $field_types[ $id ];
			$name                = $node->value( 'name', 'field' );
			$name                = is_string( $name ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/D', $name ) ? $name : 'field';
			$name                = 'fields[' . $name . ']';
			$value               = $node->value( 'value', '' );
			$value               = is_string( $value ) && 'password' !== $field_type ? $value : '';
			$required            = true === $node->value( 'required', false ) && 'hidden' !== $field_type;
			$disabled            = true === $node->value( 'disabled', false );
			$placeholder         = $node->value( 'placeholder', '' );
			$placeholder         = is_string( $placeholder ) && 'hidden' !== $field_type ? ' placeholder="' . Escape::attr( $placeholder ) . '"' : '';
			$autocomplete        = $node->value( 'autocomplete', 'off' );
			$autocomplete_values = [ 'off', 'on', 'name', 'email', 'username', 'new-password', 'current-password', 'url', 'search', 'tel', 'given-name', 'family-name' ];
			$autocomplete        = is_string( $autocomplete ) && in_array( $autocomplete, $autocomplete_values, true ) ? $autocomplete : 'off';
			$constraints         = '';
			$validation          = $this->record( $node->value( 'validation', null ) ) ?? [];
			if ( in_array( $field_type, [ 'text', 'email', 'password', 'url', 'search' ], true ) ) {
				foreach ( [
					'minLength' => 'minlength',
					'maxLength' => 'maxlength',
				] as $property => $attribute ) {
					$length = $validation[ $property ] ?? ( 'minLength' === $property ? 0 : 255 );
					if ( is_int( $length ) && $length >= 0 ) {
						$constraints .= ' ' . $attribute . '="' . min( 10000, $length ) . '"';
					}
				}
			}
			$input = '<input' . $hooks . ' id="' . $control_id . '" type="' . $field_type . '" name="' . Escape::attr( $name ) . '" autocomplete="' . $autocomplete . '"' . $placeholder . $constraints . ( $required ? ' required' : '' ) . ( $disabled ? ' disabled' : '' ) . ' value="' . Escape::attr( $value ) . '">';
			if ( 'hidden' === $field_type ) {
				return $input;
			}
			$label = $node->value( 'label', $node->value( 'ariaLabel', $this->translate_label( 'Field' ) ) );
			$label = is_string( $label ) && '' !== trim( $label ) ? trim( $label ) : $this->translate_label( 'Field' );
			return '<label for="' . $control_id . '">' . Escape::html( $label ) . '</label>' . $input;
		}
		if ( 'slider' === $id ) {
			$min = $node->value( 'min', 0 );
			$max = $node->value( 'max', 100 );
			$min = is_numeric( $min ) && is_finite( (float) $min ) ? max( -1000000, min( 1000000, (float) $min ) ) : 0;
			$max = is_numeric( $max ) && is_finite( (float) $max ) ? max( -1000000, min( 1000000, (float) $max ) ) : 100;
			if ( $max <= $min ) {
				$min = 0;
				$max = 100;
			}
			$step        = $node->value( 'step', 1 );
			$step        = is_numeric( $step ) && is_finite( (float) $step ) && (float) $step > 0 ? min( 1000000, (float) $step ) : 1;
			$initial     = $node->value( 'defaultValue', 50 );
			$initial     = is_numeric( $initial ) && is_finite( (float) $initial ) ? max( $min, min( $max, (float) $initial ) ) : $min;
			$orientation = 'vertical' === $node->value( 'orientation', 'horizontal' ) ? 'vertical' : 'horizontal';
			$control_id  = 'blx-range-' . substr( hash( 'sha256', $node->id ), 0, 12 );
			$range_label = $node->value( 'ariaLabel' );
			$range_label = is_string( $range_label ) && '' !== trim( $range_label ) ? trim( $range_label ) : $this->translate_label( 'Value' );
			return '<div' . $hooks . ' data-blx-slider data-blx-slider-orientation="' . $orientation . '"><label for="' . $control_id . '">' . Escape::html( $range_label ) . '</label><input id="' . $control_id . '" type="range" name="' . Escape::attr( $name ) . '" min="' . Escape::attr( sprintf( '%g', $min ) ) . '" max="' . Escape::attr( sprintf( '%g', $max ) ) . '" step="' . Escape::attr( sprintf( '%g', $step ) ) . '" value="' . Escape::attr( sprintf( '%g', $initial ) ) . '" aria-orientation="' . $orientation . '"' . $disabled_attr . '><output for="' . $control_id . '" data-blx-slider-value>' . Escape::html( sprintf( '%g', $initial ) ) . '</output></div>';
		}
		if ( 'range-slider' === $id ) {
			$min = $node->value( 'min', 0 );
			$max = $node->value( 'max', 100 );
			$min = is_numeric( $min ) && is_finite( (float) $min ) ? max( -1000000, min( 1000000, (float) $min ) ) : 0;
			$max = is_numeric( $max ) && is_finite( (float) $max ) ? max( -1000000, min( 1000000, (float) $max ) ) : 100;
			if ( $max <= $min ) {
				$min = 0;
				$max = 100;
			}
			$lower       = $node->value( 'defaultValue', 25 );
			$upper       = $node->value( 'upperValue', 75 );
			$lower       = is_numeric( $lower ) && is_finite( (float) $lower ) ? max( $min, min( $max, (float) $lower ) ) : $min;
			$upper       = is_numeric( $upper ) && is_finite( (float) $upper ) ? max( $min, min( $max, (float) $upper ) ) : $max;
			$upper       = max( $lower, $upper );
			$step        = $node->value( 'step', 1 );
			$step        = is_numeric( $step ) && is_finite( (float) $step ) && (float) $step > 0 ? min( 1000000, (float) $step ) : 1;
			$orientation = 'vertical' === $node->value( 'orientation', 'horizontal' ) ? 'vertical' : 'horizontal';
			$range_label = $node->value( 'ariaLabel' );
			$range_label = is_string( $range_label ) && '' !== trim( $range_label ) ? $range_label : $this->translate_label( 'Value range' );
			$range_id    = 'blx-range-pair-' . substr( hash( 'sha256', $node->id ), 0, 12 );
			return '<fieldset' . $hooks . ' data-blx-range-slider data-blx-range-orientation="' . $orientation . '"><legend>' . Escape::html( $range_label ) . '</legend><label for="' . $range_id . '-lower">' . Escape::html( $this->translate_label( 'Minimum' ) ) . ' <output data-blx-range-lower-value>' . Escape::html( sprintf( '%g', $lower ) ) . '</output></label><input id="' . $range_id . '-lower" type="range" name="' . Escape::attr( $name ) . '[min]" min="' . Escape::attr( sprintf( '%g', $min ) ) . '" max="' . Escape::attr( sprintf( '%g', $max ) ) . '" step="' . Escape::attr( sprintf( '%g', $step ) ) . '" value="' . Escape::attr( sprintf( '%g', $lower ) ) . '"' . $disabled_attr . '><label for="' . $range_id . '-upper">' . Escape::html( $this->translate_label( 'Maximum' ) ) . ' <output data-blx-range-upper-value>' . Escape::html( sprintf( '%g', $upper ) ) . '</output></label><input id="' . $range_id . '-upper" type="range" name="' . Escape::attr( $name ) . '[max]" min="' . Escape::attr( sprintf( '%g', $min ) ) . '" max="' . Escape::attr( sprintf( '%g', $max ) ) . '" step="' . Escape::attr( sprintf( '%g', $step ) ) . '" value="' . Escape::attr( sprintf( '%g', $upper ) ) . '"' . $disabled_attr . '></fieldset>';
		}
		return '';
	}

	/** Render a date range as two independently labeled native date inputs.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_date_range( ElementNode $node, string $hooks ): string {
		$base_id = 'blx-date-range-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		$name    = $node->value( 'name', 'date-range' );
		$name    = is_string( $name ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/D', $name ) ? $name : 'date-range';
		$label   = $node->value( 'ariaLabel' );
		$label   = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Date range' );
		return '<fieldset' . $hooks . '><legend>' . Escape::html( $label ) . '</legend><label for="' . $base_id . '-start">' . Escape::html( $this->translate_label( 'Start date' ) ) . '</label><input id="' . $base_id . '-start" type="date" name="' . Escape::attr( $name ) . '[start]"><label for="' . $base_id . '-end">' . Escape::html( $this->translate_label( 'End date' ) ) . '</label><input id="' . $base_id . '-end" type="date" name="' . Escape::attr( $name ) . '[end]"></fieldset>';
	}

	/** Render a native date picker or a bounded group of date inputs by calendar selection mode.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_calendar( ElementNode $node, string $hooks ): string {
		$mode = $node->value( 'mode', 'single' );
		$mode = is_string( $mode ) && in_array( $mode, [ 'single', 'multiple', 'range' ], true ) ? $mode : 'single';
		if ( 'range' === $mode ) {
			return $this->render_date_range( $node, $hooks );
		}
		$name     = $node->value( 'name', 'dates' );
		$name     = is_string( $name ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/D', $name ) ? $name : 'dates';
		$label    = $node->value( 'ariaLabel' );
		$label    = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Calendar' );
		$locale   = $node->value( 'locale' );
		$locale   = is_string( $locale ) && 1 === preg_match( '/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/D', $locale ) ? ' lang="' . Escape::attr( $locale ) . '"' : '';
		$min_date = $node->value( 'minDate' );
		$max_date = $node->value( 'maxDate' );
		$bounds   = '';
		foreach ( [
			'min' => $min_date,
			'max' => $max_date,
		] as $bound_name => $bound_value ) {
			if ( is_string( $bound_value ) && preg_match( '/^\d{4}-\d{2}-\d{2}$/D', $bound_value ) ) {
				$bounds .= ' ' . $bound_name . '="' . Escape::attr( $bound_value ) . '"';
			}
		}
		if ( 'single' === $mode ) {
			$control_id = 'blx-calendar-' . substr( hash( 'sha256', $node->id ), 0, 12 );
			return '<div' . $hooks . $locale . '><label for="' . $control_id . '">' . Escape::html( $label ) . '</label><input id="' . $control_id . '" type="date" name="' . Escape::attr( $name ) . '"' . $bounds . '></div>';
		}
		$count   = $node->value( 'maxSelections', 5 );
		$count   = is_numeric( $count ) ? max( 1, min( 10, (int) $count ) ) : 5;
		$base_id = 'blx-calendar-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		$html    = '<fieldset' . $hooks . $locale . '><legend>' . Escape::html( $label ) . '</legend>';
		for ( $index = 0; $index < $count; $index++ ) {
			$control_id = $base_id . '-' . $index;
			/* translators: %s: date selection number. */
			$date_label = function_exists( '__' ) ? sprintf( __( 'Date %s', 'blixis-builder' ), (string) ( $index + 1 ) ) : sprintf( 'Date %s', (string) ( $index + 1 ) );
			$html      .= '<label for="' . $control_id . '">' . Escape::html( $date_label ) . '</label><input id="' . $control_id . '" type="date" name="' . Escape::attr( $name ) . '[]"' . $bounds . '>';
		}
		return $html . '</fieldset>';
	}

	/** Render a bounded static table using allowlisted column keys and escaped cell values.
	 *
	 * @param string      $id Element id.
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_data_table( string $id, ElementNode $node, string $hooks ): string {
		$columns  = $node->value( 'columns', [] );
		$rows     = $node->value( 'rows', [] );
		$columns  = is_array( $columns ) ? array_slice( $columns, 0, 50 ) : [];
		$rows     = is_array( $rows ) ? array_slice( $rows, 0, 200 ) : [];
		$headers  = [];
		$keys     = [];
		$sortable = 'sortable-table' === $id && true === $node->value( 'sortable', true );
		foreach ( $columns as $column ) {
			$column = $this->record( $column );
			$key    = $column['key'] ?? null;
			$title  = $column['title'] ?? null;
			if ( ! is_string( $key ) || ! preg_match( '/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $key ) || ! is_string( $title ) ) {
				continue;
			}
			$keys[]  = $key;
			$heading = Escape::html( $title );
			if ( $sortable ) {
				$heading = '<button type="button" data-blx-sort="' . Escape::attr( $key ) . '">' . $heading . '</button>';
			}
			$headers[] = '<th scope="col">' . $heading . '</th>';
		}
		$table_id = 'blx-table-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		$search   = true === $node->value( 'filterable', false ) ? '<label for="' . $table_id . '-filter">' . Escape::html( $this->translate_label( 'Search table' ) ) . '</label><input id="' . $table_id . '-filter" type="search" data-blx-table-filter aria-controls="' . $table_id . '">' : '';
		$html     = $search . '<table' . $hooks . ' id="' . $table_id . '"' . ( is_string( $node->value( 'ariaLabel' ) ) ? ' aria-label="' . Escape::attr( $node->value( 'ariaLabel' ) ) . '"' : '' ) . ' data-blx-data-table><thead><tr>';
		$html    .= implode( '', $headers ) . '</tr></thead><tbody>';
		foreach ( $rows as $row ) {
			$row = $this->record( $row );
			if ( null === $row ) {
				continue;
			}
			$html .= '<tr>';
			foreach ( $keys as $key ) {
				$cell  = $row[ $key ] ?? '';
				$cell  = is_scalar( $cell ) ? (string) $cell : '';
				$html .= '<td>' . Escape::html( $cell ) . '</td>';
			}
			$html .= '</tr>';
		}
		return $html . '</tbody></table>';
	}

	/** Render a dismissible status notification with a no-script readable fallback.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $children Rendered child content.
	 */
	private function render_toast( ElementNode $node, string $hooks, string $children ): string {
		$title       = $node->value( 'title', '' );
		$description = $node->value( 'description', '' );
		$variant     = $node->value( 'variant', 'info' );
		$role        = in_array( $variant, [ 'error', 'danger', 'destructive' ], true ) ? 'alert' : 'status';
		$html        = '<div' . $hooks . ' data-blx-toast role="' . $role . '">';
		if ( true === $node->value( 'dismissible', true ) ) {
			$html .= '<button type="button" data-blx-toast-dismiss aria-label="' . Escape::attr( $this->translate_label( 'Dismiss notification' ) ) . '">×</button>';
		}
		if ( is_string( $title ) && '' !== $title ) {
			$html .= '<strong>' . Escape::html( $title ) . '</strong>';
		}
		if ( is_string( $description ) && '' !== $description ) {
			$html .= '<p>' . Escape::html( $description ) . '</p>';
		}
		return $html . $children . '</div>';
	}

	/** Render chart data as a readable, bounded list of native meters.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_chart_summary( ElementNode $node, string $hooks ): string {
		$data  = $node->value( 'data', [] );
		$data  = is_array( $data ) ? array_slice( $data, 0, 100 ) : [];
		$label = $node->value( 'ariaLabel' );
		$label = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Chart data' );
		$html  = '<figure' . $hooks . '><figcaption>' . Escape::html( $label ) . '</figcaption><ul>';
		foreach ( $data as $point ) {
			$point = $this->record( $point );
			$name  = $point['name'] ?? null;
			$value = $point['value'] ?? null;
			if ( ! is_string( $name ) || ! is_numeric( $value ) || ! is_finite( (float) $value ) ) {
				continue;
			}
			$value = max( 0, min( 1000000, (float) $value ) );
			$html .= '<li>' . Escape::html( $name ) . ' <meter min="0" max="1000000" value="' . Escape::attr( sprintf( '%g', $value ) ) . '">' . Escape::html( sprintf( '%g', $value ) ) . '</meter></li>';
		}
		return $html . '</ul></figure>';
	}

	/** Render a static rating meter with a textual value for assistive technology.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_rating( ElementNode $node, string $hooks ): string {
		$max   = $node->value( 'max', 5 );
		$value = $node->value( 'value', 0 );
		$max   = is_numeric( $max ) && (float) $max > 0 ? min( 100, (float) $max ) : 5;
		$value = is_numeric( $value ) && is_finite( (float) $value ) ? max( 0, min( $max, (float) $value ) ) : 0;
		$label = $node->value( 'ariaLabel' );
		$label = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Rating' );
		/* translators: 1: current rating, 2: maximum rating. */
		$rating_text = function_exists( '__' ) ? sprintf( __( '%1$s out of %2$s', 'blixis-builder' ), sprintf( '%g', $value ), sprintf( '%g', $max ) ) : sprintf( '%g out of %g', $value, $max );
		if ( true === $node->value( 'readonly', false ) ) {
			return '<label' . $hooks . '>' . Escape::html( $label ) . ' <meter min="0" max="' . Escape::attr( sprintf( '%g', $max ) ) . '" value="' . Escape::attr( sprintf( '%g', $value ) ) . '">' . Escape::html( $rating_text ) . '</meter><span class="screen-reader-text">' . Escape::html( $rating_text ) . '</span></label>';
		}
		$group_id = 'blx-rating-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		$html     = '<fieldset' . $hooks . '><legend>' . Escape::html( $label ) . '</legend>';
		for ( $score = 1; $score <= (int) $max; $score++ ) {
			$input_id = $group_id . '-' . $score;
			$html    .= '<label for="' . $input_id . '"><input id="' . $input_id . '" type="radio" name="' . $group_id . '" value="' . $score . '"' . ( (float) $score === (float) $value ? ' checked' : '' ) . '> ' . $score . '</label>';
		}
		return $html . '</fieldset>';
	}

	/** Render a tooltip with a focusable trigger and an associated description.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $children Tooltip content.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_tooltip_component( ElementNode $node, string $children, string $hooks ): string {
		$id      = 'blx-tooltip-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		$trigger = $node->value( 'triggerLabel', $this->translate_label( 'More information' ) );
		$trigger = is_string( $trigger ) && '' !== trim( $trigger ) ? $trigger : $this->translate_label( 'More information' );
		return '<span' . $hooks . ' data-blx-tooltip><button type="button" aria-describedby="' . $id . '">' . Escape::html( $trigger ) . '</button><span role="tooltip" id="' . $id . '">' . $children . '</span></span>';
	}

	/** Render a searchable command list that remains fully visible without JavaScript.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_command_palette( ElementNode $node, string $hooks ): string {
		$items       = $node->value( 'items', [] );
		$items       = is_array( $items ) ? $items : [];
		$label       = $node->value( 'ariaLabel', $this->translate_label( 'Commands' ) );
		$label       = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Commands' );
		$placeholder = $node->value( 'placeholder', $this->translate_label( 'Search commands' ) );
		$placeholder = is_string( $placeholder ) ? $placeholder : $this->translate_label( 'Search commands' );
		$empty_label = $node->value( 'emptyLabel', $this->translate_label( 'No results' ) );
		$empty_label = is_string( $empty_label ) ? $empty_label : $this->translate_label( 'No results' );
		$control_id  = 'blx-command-' . substr( hash( 'sha256', $node->id ), 0, 12 );
		return '<section' . $hooks . ' data-blx-command-palette aria-label="' . Escape::attr( $label ) . '"><label for="' . $control_id . '">' . Escape::html( $placeholder ) . '</label><input id="' . $control_id . '" type="search" data-blx-command-search><ul>' . $this->navigation_items( $items, 0 ) . '<li data-blx-command-empty hidden>' . Escape::html( $empty_label ) . '</li></ul></section>';
	}

	/** Render a no-script horizontal carousel with native scrolling controls.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string[]    $children Rendered direct children.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_carousel( ElementNode $node, array $children, string $hooks ): string {
		$label    = $node->value( 'ariaLabel', $this->translate_label( 'Carousel' ) );
		$label    = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Carousel' );
		$interval = $node->value( 'intervalMs', 5000 );
		$interval = is_numeric( $interval ) ? max( 1000, min( 30000, (int) $interval ) ) : 5000;
		$autoplay = true === $node->value( 'autoplay', false );
		$loop     = true === $node->value( 'loop', false );
		$pause    = true === $node->value( 'pauseOnHover', true );
		$arrows   = true === $node->value( 'arrows', true );
		$per_view = $node->value( 'slidesPerView', 1 );
		$per_view = is_numeric( $per_view ) ? max( 1, min( 6, (int) $per_view ) ) : 1;
		$controls = $arrows ? '<button type="button" data-blx-carousel-previous aria-label="' . Escape::attr( $this->translate_label( 'Previous slide' ) ) . '">‹</button><button type="button" data-blx-carousel-next aria-label="' . Escape::attr( $this->translate_label( 'Next slide' ) ) . '">›</button>' : '';
		if ( $autoplay ) {
			$controls .= '<button type="button" data-blx-carousel-pause data-blx-play-label="' . Escape::attr( $this->translate_label( 'Play' ) ) . '" data-blx-pause-label="' . Escape::attr( $this->translate_label( 'Pause' ) ) . '" aria-pressed="false">' . Escape::html( $this->translate_label( 'Pause' ) ) . '</button>';
		}
		$slides = '';
		$dots   = '';
		foreach ( $children as $index => $child ) {
			$slides .= '<div data-blx-carousel-slide>' . $child . '</div>';
			if ( true === $node->value( 'dots', false ) ) {
				/* translators: %s: slide number. */
				$dot_label = function_exists( '__' ) ? sprintf( __( 'Go to slide %s', 'blixis-builder' ), (string) ( $index + 1 ) ) : sprintf( 'Go to slide %s', (string) ( $index + 1 ) );
				$dots     .= '<button type="button" data-blx-carousel-dot="' . (int) $index . '" aria-label="' . Escape::attr( $dot_label ) . '">' . (int) ( $index + 1 ) . '</button>';
			}
		}
		return '<section' . $hooks . ' data-blx-carousel data-blx-carousel-autoplay="' . ( $autoplay ? 'true' : 'false' ) . '" data-blx-carousel-pause-hover="' . ( $pause ? 'true' : 'false' ) . '" data-blx-carousel-loop="' . ( $loop ? 'true' : 'false' ) . '" data-blx-carousel-interval="' . $interval . '" data-blx-carousel-slides="' . $per_view . '" aria-label="' . Escape::attr( $label ) . '"><div>' . $controls . '</div><div data-blx-carousel-track tabindex="0">' . $slides . '</div>' . ( '' !== $dots ? '<div data-blx-carousel-dots>' . $dots . '</div>' : '' ) . '</section>';
	}

	/** Render a progress element updated from the page scroll position.
	 *
	 * @param ElementNode $node Element definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_scroll_indicator( ElementNode $node, string $hooks ): string {
		$label = $node->value( 'ariaLabel' );
		$label = is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Reading progress' );
		$max   = $node->value( 'max', 100 );
		$max   = is_numeric( $max ) && (float) $max > 0 ? max( 1, min( 1000000, (float) $max ) ) : 100;
		$shown = true === $node->value( 'showLabel', false ) ? '<output data-blx-scroll-indicator-value>0%</output>' : '';
		return '<div' . $hooks . '>' . $shown . '<progress data-blx-scroll-indicator data-blx-scroll-max="' . Escape::attr( sprintf( '%g', $max ) ) . '" max="' . Escape::attr( sprintf( '%g', $max ) ) . '" value="0" aria-label="' . Escape::attr( $label ) . '"></progress></div>';
	}

	/** Render all tab content with in-page links so content remains available without JavaScript.
	 *
	 * @param ElementNode $node Tabs definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_tabs( ElementNode $node, string $hooks ): string {
		$items  = $node->value( 'items', [] );
		$items  = is_array( $items ) ? array_slice( $items, 0, 100 ) : [];
		$label  = $node->value( 'ariaLabel' );
		$nav    = '<nav aria-label="' . Escape::attr( is_string( $label ) && '' !== trim( $label ) ? $label : $this->translate_label( 'Sections' ) ) . '"><ul>';
		$panels = '';
		$active = $node->value( 'defaultValue', 'tab-1' );
		foreach ( $items as $index => $item ) {
			$item = $this->record( $item );
			if ( null === $item ) {
				continue;
			}
			$title   = $item['label'] ?? $item['title'] ?? '';
			$content = $item['content'] ?? '';
			if ( ! is_string( $title ) || ! is_string( $content ) ) {
				continue;
			}
			$id      = 'blx-tab-' . substr( hash( 'sha256', $node->id . ':' . (string) $index ), 0, 12 );
			$tab_id  = $id . '-tab';
			$tab_key = is_string( $item['id'] ?? null ) ? $item['id'] : '';
			$nav    .= '<li><a id="' . $tab_id . '" href="#' . $id . '" data-blx-tab-key="' . Escape::attr( $tab_key ) . '">' . Escape::html( $title ) . '</a></li>';
			$panels .= '<section id="' . $id . '" aria-labelledby="' . $tab_id . '"><h2>' . Escape::html( $title ) . '</h2><p>' . Escape::html( $content ) . '</p></section>';
		}
		$orientation = $node->value( 'orientation', 'horizontal' );
		$orientation = in_array( $orientation, [ 'horizontal', 'vertical' ], true ) ? $orientation : 'horizontal';
		$active      = is_string( $active ) ? $active : 'tab-1';
		return '<div' . $hooks . ' data-blx-tabs data-blx-tabs-orientation="' . Escape::attr( $orientation ) . '" data-blx-tabs-default="' . Escape::attr( $active ) . '">' . $nav . '</ul></nav>' . $panels . '</div>';
	}

	/** Render a bounded ordered list with the current step announced accessibly.
	 *
	 * @param ElementNode $node Steps definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_steps( ElementNode $node, string $hooks ): string {
		$steps       = $node->value( 'steps', [] );
		$steps       = is_array( $steps ) ? array_slice( $steps, 0, 100 ) : [];
		$active      = $node->value( 'activeStep', 0 );
		$active      = is_numeric( $active ) ? max( 0, (int) $active ) : 0;
		$label       = $node->value( 'ariaLabel' );
		$orientation = $node->value( 'orientation', 'horizontal' );
		$orientation = in_array( $orientation, [ 'horizontal', 'vertical' ], true ) ? $orientation : 'horizontal';
		$data        = 'wizard-steps' === preg_replace( '~^blixis/~', '', $node->type ) ? ' data-blx-wizard-steps data-blx-steps-orientation="' . Escape::attr( $orientation ) . '"' : '';
		$html        = '<ol' . $hooks . $data . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . '>';
		foreach ( $steps as $index => $step ) {
			$step = $this->record( $step );
			if ( null === $step || ! is_string( $step['title'] ?? null ) ) {
				continue;
			}
			$html .= '<li' . ( $index === $active ? ' aria-current="step"' : '' ) . '><span>' . Escape::html( $step['title'] ) . '</span>';
			if ( is_string( $step['description'] ?? null ) && '' !== $step['description'] ) {
				$html .= '<p>' . Escape::html( $step['description'] ) . '</p>';
			}
			$html .= '</li>';
		}
		return $html . '</ol>';
	}

	/** Convert decoded JSON objects to arrays for bounded renderer access.
	 *
	 * @param mixed $value JSON value.
	 * @return array<string,mixed>|null Object fields or null.
	 */
	private function record( mixed $value ): ?array {
		if ( $value instanceof \stdClass ) {
			$value = get_object_vars( $value );
		}
		return is_array( $value ) && ! array_is_list( $value ) ? $value : null;
	}

	/** Render a bounded list of escaped text entries.
	 *
	 * @param ElementNode $node List element.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_list( ElementNode $node, string $hooks ): string {
		$items      = $node->value( 'items', [] );
		$ordered    = true === $node->value( 'ordered', false ) || 'number' === $node->value( 'listStyle' );
		$list_style = $node->value( 'listStyle', 'bullet' );
		$styles     = [ 'bullet', 'number', 'none', 'check' ];
		$list_style = is_string( $list_style ) && in_array( $list_style, $styles, true ) ? $list_style : 'bullet';
		$tag        = $ordered ? 'ol' : 'ul';
		$html       = '<' . $tag . $hooks . ' data-blx-list-style="' . Escape::attr( $list_style ) . '">';
		if ( ! is_array( $items ) ) {
			$items = [];
		}
		foreach ( array_slice( $items, 0, 100 ) as $item ) {
			if ( $item instanceof \stdClass ) {
				$item = get_object_vars( $item );
			}
			$text = is_array( $item ) ? ( $item['text'] ?? $item['label'] ?? '' ) : $item;
			if ( is_string( $text ) ) {
				$html .= '<li>' . Escape::html( $text ) . '</li>';
			}
		}
		return $html . '</' . $tag . '>';
	}

	/** Resolve layout semantics with a fixed tag allowlist.
	 *
	 * @param mixed  $candidate Requested semantic tag.
	 * @param string $fallback Fallback tag.
	 */
	private function semantic_tag( mixed $candidate, string $fallback ): string {
		return is_string( $candidate ) && in_array( $candidate, [ 'div', 'section', 'main', 'header', 'footer', 'aside', 'article', 'nav' ], true ) ? $candidate : $fallback;
	}

	/** Emit only the bounded common attributes supported by layout definitions.
	 *
	 * @param ElementNode $node Layout element.
	 */
	private function layout_attributes( ElementNode $node ): string {
		$attributes = '';
		$id         = $node->value( 'htmlId' );
		if ( is_string( $id ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9_:\\-.]{0,63}$/D', $id ) ) {
			$attributes .= ' id="' . Escape::attr( $id ) . '"';
		}
		$label = $node->value( 'ariaLabel' );
		if ( is_string( $label ) && '' !== trim( $label ) ) {
			$attributes .= ' aria-label="' . Escape::attr( $label ) . '"';
		}
		if ( true === $node->value( 'hidden', false ) ) {
			$attributes .= ' hidden';
		}
		return $attributes;
	}

	/** Render escaped source code with optional line numbers and copy enhancement.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Validated attributes.
	 * @param string      $language Allowlisted language.
	 * @param string      $code Source text.
	 * @param bool        $highlight Whether to wrap syntax tokens.
	 */
	private function render_code_block( ElementNode $node, string $hooks, string $language, string $code, bool $highlight ): string {
		$show_lines = true === $node->value( 'showLineNumbers', true );
		$lines      = explode( "\n", $code );
		$source     = '';
		foreach ( $lines as $line ) {
			$line_html = $highlight ? $this->highlight_code_line( $line, $language ) : Escape::html( $line );
			$source   .= ( $show_lines ? '<span data-blx-code-line>' : '' ) . $line_html . ( $show_lines ? '</span>' : '' ) . "\n";
		}
		$button = true === $node->value( 'copyable', true )
			? '<button type="button" data-blx-code-copy data-blx-copy-success="' . Escape::attr( __( 'Copied.', 'blixis-builder' ) ) . '" data-blx-copy-failed="' . Escape::attr( __( 'Copy failed.', 'blixis-builder' ) ) . '" hidden>' . Escape::html( __( 'Copy code', 'blixis-builder' ) ) . '</button><span data-blx-code-status aria-live="polite"></span>'
			: '';
		return '<div' . $hooks . ' data-blx-code-block data-blx-code-highlight="' . ( $highlight ? 'true' : 'false' ) . '">' . $button . '<pre' . ( $show_lines ? ' data-blx-code-line-numbers' : '' ) . '><code class="language-' . Escape::attr( $language ) . '">' . $source . '</code></pre></div>';
	}

	/** Add static token spans without trusting user markup.
	 *
	 * @param string $line Source line.
	 * @param string $language Allowlisted language.
	 */
	private function highlight_code_line( string $line, string $language ): string {
		$comment = 'php' === $language || 'bash' === $language ? '#[^\n]*' : '//[^\n]*|/\*[\s\S]*?\*/';
		$pattern = '~(?<comment>' . $comment . ')|(?<string>"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')|(?<number>\b\d+(?:\.\d+)?\b)|(?<keyword>\b(?:const|let|var|function|return|if|else|class|new|true|false|null|echo|public|private)\b)~';
		if ( false === preg_match_all( $pattern, $line, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE ) || [] === $matches ) {
			return Escape::html( $line );
		}
		$html   = '';
		$offset = 0;
		foreach ( $matches as $match ) {
			foreach ( [ 'comment', 'string', 'number', 'keyword' ] as $kind ) {
				if ( isset( $match[ $kind ] ) && -1 !== $match[ $kind ][1] ) {
					$token  = $match[ $kind ][0];
					$html  .= Escape::html( substr( $line, $offset, $match[ $kind ][1] - $offset ) ) . '<span data-blx-code-token="' . $kind . '">' . Escape::html( $token ) . '</span>';
					$offset = $match[ $kind ][1] + strlen( $token );
					break;
				}
			}
		}
		return $html . Escape::html( substr( $line, $offset ) );
	}

	/** Render a client-updated countdown using an absolute UTC target.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Validated attributes.
	 */
	private function render_countdown( ElementNode $node, string $hooks ): string {
		$target = $node->value( 'targetISO', '2027-01-01T00:00:00Z' );
		$target = is_string( $target ) && false !== strtotime( $target ) ? $target : '2027-01-01T00:00:00Z';
		$format = $node->value( 'format', 'days-hours-minutes-seconds' );
		$format = is_string( $format ) && in_array( $format, [ 'days', 'days-hours', 'days-hours-minutes-seconds' ], true ) ? $format : 'days-hours-minutes-seconds';
		$label  = $node->value( 'ariaLabel', '' );
		$label  = is_string( $label ) && '' !== trim( $label ) ? $label : __( 'Countdown', 'blixis-builder' );
		return '<time' . $hooks . ' role="timer" aria-live="off" aria-label="' . Escape::attr( $label ) . '" data-blx-countdown data-blx-countdown-target="' . Escape::attr( $target ) . '" data-blx-countdown-format="' . Escape::attr( $format ) . '" data-blx-countdown-complete="' . Escape::attr( __( 'Countdown complete', 'blixis-builder' ) ) . '">' . Escape::html( $target ) . '</time>';
	}

	/** Render a validated icon glyph and its accessible label contract.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Validated attributes.
	 */
	private function render_icon( ElementNode $node, string $hooks ): string {
		$icon       = $node->value( 'icon', 'solar:star-linear' );
		$icon       = is_string( $icon ) && in_array( $icon, [ 'solar:star-linear', 'solar:check-circle-linear', 'solar:info-circle-linear' ], true ) ? $icon : 'solar:star-linear';
		$decorative = true === $node->value( 'decorative', true );
		$label      = $node->value( 'ariaLabel', '' );
		$label      = is_string( $label ) ? trim( $label ) : '';
		$size       = $node->value( 'size', 24 );
		$size       = is_numeric( $size ) ? max( 8, min( 128, (int) $size ) ) : 24;
		$svg        = $this->icon_svg( $icon, $size );
		return '<span' . $hooks . ( $decorative || '' === $label ? ' aria-hidden="true"' : ' role="img" aria-label="' . Escape::attr( $label ) . '"' ) . ' data-blx-icon="' . Escape::attr( $icon ) . '">' . $svg . '</span>';
	}

	/** Render accessible list items with decorative symbols.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Validated attributes.
	 */
	private function render_icon_list( ElementNode $node, string $hooks ): string {
		$items   = $node->value( 'items', [] );
		$items   = is_array( $items ) ? $items : [];
		$ordered = true === $node->value( 'ordered', false ) || 'number' === $node->value( 'listStyle' );
		$tag     = $ordered ? 'ol' : 'ul';
		$icon    = match ( $node->value( 'listStyle', 'bullet' ) ) {
			'check' => '&#10003;',
			'none'  => '',
			default => '&#8226;',
		};
		$rows = '';
		foreach ( array_slice( $items, 0, 100 ) as $item ) {
			if ( ! is_array( $item ) || ! is_string( $item['text'] ?? null ) ) {
				continue;
			}
			$rows .= '<li><span aria-hidden="true" data-blx-list-icon>' . $icon . '</span>' . Escape::html( $item['text'] ) . '</li>';
		}
		$label = $node->value( 'ariaLabel', '' );
		$label = is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '';
		return '<' . $tag . $hooks . $label . ' data-blx-icon-list>' . $rows . '</' . $tag . '>';
	}

	/** Render only supported icon-button actions; unsupported actions remain visibly disabled.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Validated attributes.
	 */
	private function render_icon_button( ElementNode $node, string $hooks ): string {
		$label  = $node->value( 'label', 'Button' );
		$label  = is_string( $label ) ? $label : 'Button';
		$before = $node->value( 'iconBefore' );
		$after  = $node->value( 'iconAfter' );
		$before = is_string( $before ) ? $this->icon_svg( $before ) : '';
		$after  = is_string( $after ) ? $this->icon_svg( $after ) : '';
		$attrs  = ' data-blx-button-variant="' . Escape::attr( (string) $node->value( 'variant', 'primary' ) ) . '" data-blx-button-size="' . Escape::attr( (string) $node->value( 'size', 'md' ) ) . '"';
		if ( true === $node->value( 'disabled', false ) ) {
			return '<button' . $hooks . $attrs . ' type="button" disabled>' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</button>';
		}
		$action = $node->value( 'action', 'link' );
		if ( 'link' === $action ) {
			$href = $node->value( 'href', '' );
			return '<a' . $hooks . $attrs . ' href="' . Escape::url( is_string( $href ) ? $href : '' ) . '">' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</a>';
		}
		if ( 'submit' === $action ) {
			return '<button' . $hooks . $attrs . ' type="submit">' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</button>';
		}
		$target = $node->value( 'targetId', '' );
		$target = is_string( $target ) && 1 === preg_match( '/^[A-Za-z][A-Za-z0-9:_-]{0,63}$/D', $target ) ? $target : '';
		if ( 'custom-event' === $action ) {
			return '<button' . $hooks . $attrs . ' type="button" data-blx-action="custom-event">' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</button>';
		}
		if ( '' === $target ) {
			return '<button' . $hooks . $attrs . ' type="button" disabled>' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</button>';
		}
		if ( 'scroll-to' === $action ) {
			return '<a' . $hooks . $attrs . ' href="#' . Escape::attr( $target ) . '">' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</a>';
		}
		if ( 'open-dialog' === $action ) {
			return '<button' . $hooks . $attrs . ' type="button" data-blx-action="open-dialog" data-blx-action-target="' . Escape::attr( $target ) . '">' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</button>';
		}
		if ( 'toggle' === $action ) {
			return '<button' . $hooks . $attrs . ' type="button" aria-expanded="false" aria-controls="' . Escape::attr( $target ) . '" data-blx-action="toggle" data-blx-action-target="' . Escape::attr( $target ) . '">' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</button>';
		}
		return '<button' . $hooks . $attrs . ' type="button" disabled>' . $before . '<span>' . Escape::html( $label ) . '</span>' . $after . '</button>';
	}

	/** Render a keyboard-focusable tooltip with a stable description id.
	 *
	 * @param ElementNode $node Element data.
	 * @param string      $hooks Validated attributes.
	 * @param string      $tag Validated semantic tag.
	 */
	private function render_tooltip_text( ElementNode $node, string $hooks, string $tag ): string {
		$content = $node->value( 'content', '' );
		$content = is_string( $content ) ? $content : '';
		$tooltip = $node->value( 'tooltip', 'More information' );
		$tooltip = is_string( $tooltip ) ? $tooltip : 'More information';
		$id      = $node->id . '-tooltip';
		return '<' . $tag . $hooks . ' tabindex="0" aria-describedby="' . Escape::attr( $id ) . '" data-blx-tooltip-text><span>' . Escape::html( $content ) . '</span><span role="tooltip" id="' . Escape::attr( $id ) . '">' . Escape::html( $tooltip ) . '</span></' . $tag . '>';
	}

	/** Build a short allowlisted gradient from hex stops.
	 *
	 * @param mixed $value Gradient data.
	 */
	private function gradient_value( mixed $value ): string {
		$angle  = is_array( $value ) && is_numeric( $value['angle'] ?? null ) ? max( 0, min( 360, (float) $value['angle'] ) ) : 90;
		$stops  = is_array( $value ) && is_array( $value['stops'] ?? null ) ? $value['stops'] : [];
		$colors = [];
		foreach ( array_slice( $stops, 0, 8 ) as $stop ) {
			if ( ! is_array( $stop ) ) {
				continue;
			}
			$color = $stop['color'] ?? '';
			$at    = is_numeric( $stop['at'] ?? null ) ? max( 0, min( 100, (float) $stop['at'] ) ) : null;
			if ( is_string( $color ) && 1 === preg_match( '/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/D', $color ) ) {
				$colors[] = $color . ( null === $at ? '' : ' ' . $at . '%' );
			}
		}
		if ( count( $colors ) < 2 ) {
			$colors = [ '#2563eb 0%', '#ec4899 100%' ];
		}
		return 'linear-gradient(' . $angle . 'deg,' . implode( ',', $colors ) . ')';
	}

	/** Return a small inline symbol for known Solar icon references.
	 *
	 * @param string $icon Icon reference.
	 * @param int    $size Icon size in CSS pixels.
	 */
	private function icon_svg( string $icon, int $size = 24 ): string {
		$paths = [
			'solar:star-linear'         => '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
			'solar:check-circle-linear' => '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
			'solar:info-circle-linear'  => '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
		];
		$path  = $paths[ $icon ] ?? $paths['solar:star-linear'];
		$size  = max( 8, min( 128, $size ) );
		return '<svg viewBox="0 0 24 24" width="' . $size . '" height="' . $size . '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' . $path . '</svg>';
	}

	/** Render child panels with keyboard-operable native separators.
	 *
	 * @param ElementNode $node Element properties.
	 * @param string[]    $children Pre-rendered direct children.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $tag Semantic wrapper tag.
	 */
	private function render_resizable_panels( ElementNode $node, array $children, string $hooks, string $tag ): string {
		$orientation           = 'vertical' === $node->value( 'orientation', 'horizontal' ) ? 'vertical' : 'horizontal';
		$minimum               = $node->value( 'minPanelSize', 20 );
		$minimum               = is_numeric( $minimum ) ? max( 10, min( 40, (float) $minimum ) ) : 20.0;
		$minimum_text          = rtrim( rtrim( sprintf( '%.2F', $minimum ), '0' ), '.' );
		$separator_orientation = 'horizontal' === $orientation ? 'vertical' : 'horizontal';
		$root                  = '<' . $tag . $hooks . ' data-blx-resizable-panels="' . $orientation . '" data-blx-resize-min="' . Escape::attr( $minimum_text ) . '">';
		if ( count( $children ) < 2 ) {
			return $root . implode( '', $children ) . '</' . $tag . '>';
		}
		$prefix = substr( $node->id, 0, 48 );
		$html   = $root;
		foreach ( $children as $index => $child ) {
			$panel_id = $prefix . '-panel-' . ( $index + 1 );
			$html    .= '<div id="' . Escape::attr( $panel_id ) . '" data-blx-resizable-panel>' . $child . '</div>';
			if ( $index < count( $children ) - 1 ) {
				$next_id = $prefix . '-panel-' . ( $index + 2 );
				$html   .= '<div role="separator" aria-label="' . Escape::attr( __( 'Resize panel', 'blixis-builder' ) ) . '" aria-orientation="' . $separator_orientation . '" aria-controls="' . Escape::attr( $panel_id . ' ' . $next_id ) . '" aria-valuemin="' . Escape::attr( $minimum_text ) . '" aria-valuemax="' . Escape::attr( (string) ( 100 - $minimum ) ) . '" aria-valuenow="50" tabindex="0" data-blx-resize-handle></div>';
			}
		}
		return $html . '</' . $tag . '>';
	}

	/** Render a reduced-motion-aware marquee with a pause control and inert duplicate track.
	 *
	 * @param ElementNode $node Element properties.
	 * @param string      $children Pre-rendered child content.
	 * @param string      $hooks Validated element hooks.
	 * @param string      $tag Semantic wrapper tag.
	 */
	private function render_marquee_layout( ElementNode $node, string $children, string $hooks, string $tag ): string {
		$direction = 'right' === $node->value( 'direction', 'left' ) ? 'right' : 'left';
		$duration  = $node->value( 'duration', 30 );
		$duration  = is_numeric( $duration ) ? max( 10, min( 120, (int) $duration ) ) : 30;
		if ( '' === trim( $children ) ) {
			return '<' . $tag . $hooks . ' data-blx-marquee="' . $direction . '" data-blx-marquee-duration="' . $duration . '"></' . $tag . '>';
		}
		$clone  = preg_replace( '/\s+id\s*=\s*(?:"[^"]*"|\'[^\']*\')/i', '', $children );
		$clone  = is_string( $clone ) ? $clone : '';
		$pause  = __( 'Pause scrolling', 'blixis-builder' );
		$resume = __( 'Resume scrolling', 'blixis-builder' );
		return '<' . $tag . $hooks . ' data-blx-marquee="' . $direction . '" data-blx-marquee-duration="' . $duration . '">'
			. '<div data-blx-marquee-viewport><div data-blx-marquee-track>'
			. '<div data-blx-marquee-group>' . $children . '</div>'
			. '<div data-blx-marquee-group aria-hidden="true" inert>' . $clone . '</div>'
			. '</div></div>'
			. '<button type="button" data-blx-marquee-toggle data-blx-pause-label="' . Escape::attr( $pause ) . '" data-blx-resume-label="' . Escape::attr( $resume ) . '" aria-label="' . Escape::attr( $pause ) . '" aria-pressed="false">' . Escape::html( $pause ) . '</button>'
			. '</' . $tag . '>';
	}

	/** Render bounded navigation entries with guarded links and nested children.
	 *
	 * @param array<mixed> $items Items.
	 * @param int          $depth Nesting depth.
	 */
	private function navigation_items( array $items, int $depth ): string {
		if ( $depth > 8 ) {
			return ''; }
		$html = '';
		foreach ( array_slice( $items, 0, 100 ) as $item ) {
			if ( $item instanceof \stdClass ) {
				$item = get_object_vars( $item ); }
			if ( ! is_array( $item ) || ! is_string( $item['label'] ?? null ) ) {
				continue; }
			$href = $item['link'] ?? $item['href'] ?? '#';
			if ( ! is_string( $href ) ) {
				$href = '#'; }
			$current  = true === ( $item['current'] ?? false ) ? ' aria-current="page"' : '';
			$children = is_array( $item['children'] ?? null ) ? $item['children'] : [];
			$html    .= '<li><a href="' . Escape::url( $href ) . '"' . $current . '>' . Escape::html( $item['label'] ) . '</a>';
			if ( $children ) {
				$html .= '<ul>' . $this->navigation_items( $children, $depth + 1 ) . '</ul>'; }
			$html .= '</li>';
		}
		return $html;
	}

	/** Render breadcrumb items with an explicit current-page marker.
	 *
	 * @param ElementNode $node Breadcrumb definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_breadcrumbs( ElementNode $node, string $hooks ): string {
		$items         = $node->value( 'items', [] );
		$items         = is_array( $items ) ? array_slice( $items, 0, 100 ) : [];
		$items         = array_values(
			array_filter(
				$items,
				static function ( mixed $item ): bool {
					if ( $item instanceof \stdClass ) {
						$item = get_object_vars( $item );
					}
					return is_array( $item ) && is_string( $item['label'] ?? null );
				}
			)
		);
		$default_label = $this->translate_label( 'Breadcrumb' );
		$label         = $node->value( 'ariaLabel', $default_label );
		$html          = '<nav' . $hooks . ' aria-label="' . Escape::attr( is_string( $label ) && '' !== trim( $label ) ? $label : $default_label ) . '"><ol>';
		$last          = count( $items ) - 1;
		foreach ( $items as $index => $item ) {
			if ( $item instanceof \stdClass ) {
				$item = get_object_vars( $item );
			}
			if ( true === ( $item['current'] ?? false ) ) {
				$last = $index;
				break;
			}
		}
		foreach ( $items as $index => $item ) {
			if ( $item instanceof \stdClass ) {
				$item = get_object_vars( $item );
			}
			if ( ! is_string( $item['label'] ?? null ) ) {
				continue;
			}
			$current = $index === $last;
			$html   .= '<li>';
			if ( $current ) {
				$html .= '<span aria-current="page">' . Escape::html( $item['label'] ) . '</span>';
			} else {
				$href  = is_string( $item['href'] ?? $item['link'] ?? null ) ? ( $item['href'] ?? $item['link'] ) : '#';
				$html .= '<a href="' . Escape::url( $href ) . '">' . Escape::html( $item['label'] ) . '</a>';
			}
			$html .= '</li>';
		}
		return $html . '</ol></nav>';
	}

	/** Render bounded page links from static pagination properties.
	 *
	 * @param ElementNode $node Pagination definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_pagination( ElementNode $node, string $hooks ): string {
		$total         = $node->value( 'total', 1 );
		$page_size     = $node->value( 'pageSize', 10 );
		$current       = $node->value( 'currentPage', 1 );
		$total         = is_numeric( $total ) ? max( 0, min( 1000000, (int) $total ) ) : 0;
		$page_size     = is_numeric( $page_size ) ? max( 1, min( 1000, (int) $page_size ) ) : 10;
		$page_count    = max( 1, min( 1000, (int) ceil( $total / $page_size ) ) );
		$current       = is_numeric( $current ) ? max( 1, min( $page_count, (int) $current ) ) : 1;
		$base          = $node->value( 'basePath', '' );
		$base          = is_string( $base ) && SafeUrl::accepts( $base ) ? $base : '';
		$default_label = $this->translate_label( 'Pagination' );
		$label         = $node->value( 'ariaLabel', $default_label );
		$mode          = $node->value( 'mode', 'numeric' );
		$html          = '<nav' . $hooks . ' aria-label="' . Escape::attr( is_string( $label ) && '' !== trim( $label ) ? $label : $default_label ) . '"><ul>';
		$make_link     = static function ( int $page ) use ( $base ): string {
			$fragment = '';
			if ( str_contains( $base, '#' ) ) {
				[ $base, $fragment ] = explode( '#', $base, 2 );
				$fragment            = '#' . $fragment;
			}
			$separator = str_contains( $base, '?' ) ? '&' : '?';
			return Escape::url( $base . $separator . 'page=' . $page . $fragment );
		};
		if ( $current > 1 ) {
			$html .= '<li><a rel="prev" href="' . $make_link( $current - 1 ) . '">' . Escape::html( $this->translate_label( 'Previous' ) ) . '</a></li>';
		}
		if ( 'previous-next' !== $mode && 'load-more' !== $mode ) {
			for ( $page = 1; $page <= $page_count; ++$page ) {
				$html .= '<li>' . ( $page === $current ? '<span aria-current="page">' . $page . '</span>' : '<a href="' . $make_link( $page ) . '">' . $page . '</a>' ) . '</li>';
			}
		}
		if ( $current < $page_count ) {
			$text  = $this->translate_label( 'load-more' === $mode ? 'Load more' : 'Next' );
			$html .= '<li><a rel="next" href="' . $make_link( $current + 1 ) . '">' . Escape::html( $text ) . '</a></li>';
		}
		return $html . '</ul></nav>';
	}

	/** Translate built-in navigation labels when WordPress is available.
	 *
	 * @param string $label Default English label.
	 */
	private function translate_label( string $label ): string {
		if ( ! function_exists( '__' ) ) {
			return $label;
		}
		return match ( $label ) {
			'Back to top' => __( 'Back to top', 'blixis-builder' ),
			'Breadcrumb' => __( 'Breadcrumb', 'blixis-builder' ),
			'Close panel' => __( 'Close panel', 'blixis-builder' ),
			'Copied.' => __( 'Copied.', 'blixis-builder' ),
			'Copy failed.' => __( 'Copy failed.', 'blixis-builder' ),
			'Chart data' => __( 'Chart data', 'blixis-builder' ),
			'Date range' => __( 'Date range', 'blixis-builder' ),
			'Dismiss notification' => __( 'Dismiss notification', 'blixis-builder' ),
			'Menu' => __( 'Menu', 'blixis-builder' ),
			'Mobile navigation' => __( 'Mobile navigation', 'blixis-builder' ),
			'Navigation' => __( 'Navigation', 'blixis-builder' ),
			'Off-canvas panel' => __( 'Off-canvas panel', 'blixis-builder' ),
			'Open' => __( 'Open', 'blixis-builder' ),
			'Pause' => __( 'Pause', 'blixis-builder' ),
			'Play' => __( 'Play', 'blixis-builder' ),
			'Pagination' => __( 'Pagination', 'blixis-builder' ),
			'Previous'  => __( 'Previous', 'blixis-builder' ),
			'Previous slide' => __( 'Previous slide', 'blixis-builder' ),
			'Next slide' => __( 'Next slide', 'blixis-builder' ),
			'Next'      => __( 'Next', 'blixis-builder' ),
			'Load more' => __( 'Load more', 'blixis-builder' ),
			'More information' => __( 'More information', 'blixis-builder' ),
			'Minimum' => __( 'Minimum', 'blixis-builder' ),
			'Maximum' => __( 'Maximum', 'blixis-builder' ),
			'Value range' => __( 'Value range', 'blixis-builder' ),
			'No results' => __( 'No results', 'blixis-builder' ),
			'Open menu' => __( 'Open menu', 'blixis-builder' ),
			'Commands' => __( 'Commands', 'blixis-builder' ),
			'Search commands' => __( 'Search commands', 'blixis-builder' ),
			'Search' => __( 'Search', 'blixis-builder' ),
			'Show more' => __( 'Show more', 'blixis-builder' ),
			'Reading progress' => __( 'Reading progress', 'blixis-builder' ),
			'Carousel' => __( 'Carousel', 'blixis-builder' ),
			'Calendar' => __( 'Calendar', 'blixis-builder' ),
			'Progress' => __( 'Progress', 'blixis-builder' ),
			'Rating' => __( 'Rating', 'blixis-builder' ),
			'Select option' => __( 'Select option', 'blixis-builder' ),
			'Search table' => __( 'Search table', 'blixis-builder' ),
			'Start date' => __( 'Start date', 'blixis-builder' ),
			'End date' => __( 'End date', 'blixis-builder' ),
			'Value' => __( 'Value', 'blixis-builder' ),
			'Sidebar navigation' => __( 'Sidebar navigation', 'blixis-builder' ),
			'Sections' => __( 'Sections', 'blixis-builder' ),
			default     => $label,
		};
	}

	/** Render an imported asset reference through the media resolver.
	 *
	 * @param ElementNode $node          Element input.
	 * @param bool        $include_hooks Include the node's generated editor hooks.
	 * @return string Safe image markup or an empty string.
	 */
	private function asset_image( ElementNode $node, bool $include_hooks = true ): string {
		$reference = $node->value( 'assetRef' );
		if ( ! is_string( $reference ) ) {
			return '';
		}
		$image = $this->resolve_image_reference( $reference );
		if ( null === $image || ! SafeUrl::accepts( $image['url'] ) ) {
			return '';
		}
		$alt = $node->value( 'alt', $image['alt'] );
		$alt = is_string( $alt ) ? $alt : '';
		if ( '' === $alt && true !== $node->value( 'decorative', false ) ) {
			$alt = $image['alt'];
		}
		$srcset        = is_string( $image['srcset'] ?? null ) ? \Blixis\Builder\Media\MediaPolicy::srcset( $image['srcset'] ) : null;
		$sizes         = null !== $srcset && is_string( $node->value( 'sizes', $image['sizes'] ?? '' ) ) ? \Blixis\Builder\Media\MediaPolicy::sizes( $node->value( 'sizes', $image['sizes'] ?? '' ) ) : null;
		$loading       = $node->value( 'loading', 'lazy' );
		$loading       = is_string( $loading ) && in_array( $loading, [ 'lazy', 'eager' ], true ) ? $loading : 'lazy';
		$priority      = $node->value( 'fetchPriority', 'auto' );
		$priority      = is_string( $priority ) && in_array( $priority, [ 'auto', 'high', 'low' ], true ) ? $priority : 'auto';
		$priority_attr = 'auto' !== $priority ? ' fetchpriority="' . $priority . '"' : '';
		return '<img' . ( $include_hooks ? Escape::hooks( $node ) : '' ) . ' src="' . Escape::url( $image['url'] ) . '"' . ( null === $srcset ? '' : ' srcset="' . Escape::attr( $srcset ) . '"' ) . ( null === $sizes ? '' : ' sizes="' . Escape::attr( $sizes ) . '"' ) . ' width="' . (int) $image['width'] . '" height="' . (int) $image['height'] . '" alt="' . Escape::attr( $alt ) . '" loading="' . $loading . '"' . $priority_attr . ' decoding="async">';
	}

	/** Resolve either an attachment id or a bundled asset key as a safe image.
	 *
	 * @param string $reference Saved asset reference.
	 * @return array{url:string,width:int,height:int,alt:string,srcset?:string,sizes?:string}|null Resolved image.
	 */
	private function resolve_image_reference( string $reference ): ?array {
		if ( 1 === preg_match( '/^attachment:([1-9][0-9]{0,8})$/D', $reference, $matches ) ) {
			return $this->media->resolve( (int) $matches[1] );
		}
		return $this->media instanceof AssetReferenceResolver ? $this->media->resolve_reference( $reference ) : null;
	}
}
