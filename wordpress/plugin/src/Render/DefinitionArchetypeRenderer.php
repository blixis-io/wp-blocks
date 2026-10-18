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
		return in_array( $archetype, [ 'container','simple','text','richtext','heading','button','link','image','gallery','navigation','list','code','accordion','tabs','steps','alert','progress','card','layout','section','page','site-header','site-footer','site-logo','row','columns','grid','stack' ], true ); }
	/** Render an element with escaped text and allowlisted tags/attributes.
	 *
	 * @param ElementNode   $node Element input.
	 * @param RenderContext $context Child content and token metadata.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$id         = preg_replace( '~^blixis/~', '', $node->type );
		$definition = $this->definitions->get( (string) $id );
		$archetype  = is_array( $definition ) ? (string) ( $definition['archetype'] ?? '' ) : '';
		if ( ! $this->supports( $archetype ) ) {
			return ( new StaticFallbackRenderer() )->render( $node, $context );
		}
		$tag = self::TAGS[ (string) $id ] ?? match ( $archetype ) {
			'heading' => 'h2', 'text', 'richtext' => 'p', 'navigation' => 'nav', default => 'div' };
		if ( 'heading' === $id ) {
			$candidate = $node->value( 'tag', 'h2' );
			if ( is_string( $candidate ) && in_array( $candidate, [ 'h1','h2','h3','h4','h5','h6' ], true ) ) {
				$tag = $candidate;
			}
		}
		$hooks = Escape::hooks( $node );
		if ( 'container' === $archetype ) {
			$fallback = 'section' === $id ? 'section' : 'div';
			$tag      = $this->semantic_tag( $node->value( 'semanticTag', $node->value( 'tag', $fallback ) ), $fallback );
			$hooks   .= $this->layout_attributes( $node );
		}
		if ( 'spacer' === $id ) {
			return '<div' . $hooks . ' aria-hidden="true"></div>';
		}
		if ( 'separator' === $id ) {
			return '<hr' . $hooks . ' aria-hidden="true">';
		}
		if ( 'list' === $archetype ) {
			return $this->render_list( $node, $hooks );
		}
		if ( 'code' === $archetype ) {
			$language = $node->value( 'language', 'text' );
			$allowed  = [ 'text', 'html', 'css', 'js', 'ts', 'json', 'php', 'bash' ];
			$language = is_string( $language ) && in_array( $language, $allowed, true ) ? $language : 'text';
			$code     = $node->value( 'code', '' );
			return '<pre' . $hooks . '><code class="language-' . Escape::attr( $language ) . '">' . Escape::html( is_string( $code ) ? $code : '' ) . '</code></pre>';
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
		if ( 'container' === $id ) {
			$width = $node->value( 'maxWidthToken', $node->value( 'maxWidth', 'default' ) );
			if ( ! is_string( $width ) || ! preg_match( '/^[a-z0-9-]{1,40}$/D', $width ) ) {
				$width = 'default';
			} $hooks .= ' data-blx-max-width="' . Escape::attr( $width ) . '"'; }
		if ( in_array( $id, [ 'text','heading','button','site-title','rich-text','paragraph' ], true ) || in_array( $archetype, [ 'text','richtext' ], true ) ) {
			$value = $node->value( 'content', $node->value( 'text', $node->value( 'label', '' ) ) );
			if ( is_array( $value ) && array_is_list( $value ) ) {
				$value = implode( '', array_map( static fn ( mixed $part ): string => is_array( $part ) && is_string( $part['text'] ?? null ) ? $part['text'] : '', $value ) );
			}
			$body = is_string( $value ) ? Escape::html( $value ) : RichText::render_validated( $value, true, $context->token_ids );
			if ( 'button' === $id ) {
				$href        = $node->value( 'href', $node->value( 'url', '#' ) );
				$target      = $node->value( 'target' );
				$target_attr = '_blank' === $target ? ' target="_blank" rel="noopener noreferrer"' : '';
				return '<a' . $hooks . ' href="' . Escape::url( is_string( $href ) ? $href : '#' ) . '"' . $target_attr . '>' . $body . '</a>'; }
			return '<' . $tag . $hooks . '>' . $body . '</' . $tag . '>';
		}
		if ( 'navigation' === $archetype && in_array( $id, [ 'navigation', 'navigation-menu', 'nav-menu', 'mobile-menu', 'breadcrumbs', 'table-of-contents', 'anchor-links', 'mega-menu', 'sidebar-navigation', 'scroll-spy', 'dropdown-menu', 'breadcrumb-ui' ], true ) && is_array( $node->value( 'items', null ) ) ) {
			$label = $node->value( 'ariaLabel' );
			return '<nav' . $hooks . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . '><ul>' . $this->navigation_items( $node->value( 'items', [] ), 0 ) . '</ul></nav>';
		}
		if ( 'accordion' === $archetype ) {
			return $this->render_accordion( $node, $hooks );
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
		if ( 'progress' === $archetype ) {
			return $this->render_progress( $node, $hooks );
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
		if ( 'gallery' === $archetype ) {
			return $this->render_gallery( $node, $hooks );
		}
		if ( 'image' === $archetype && in_array( $id, [ 'image', 'picture', 'avatar', 'featured-image', 'product-image', 'before-after', 'image-comparison', 'image-hotspots', 'panorama-360', 'blur-up-image' ], true ) ) {
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

	/** Render a static gallery from approved image asset references.
	 *
	 * @param ElementNode $node Gallery element.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_gallery( ElementNode $node, string $hooks ): string {
		$assets  = $node->value( 'assets', [] );
		$assets  = is_array( $assets ) ? array_slice( $assets, 0, 32 ) : [];
		$columns = $node->value( 'columns', 3 );
		$columns = is_numeric( $columns ) ? max( 1, min( 6, (int) $columns ) ) : 3;
		$label   = $node->value( 'ariaLabel', 'Image gallery' );
		$html    = '<div' . $hooks . ' data-blx-columns="' . $columns . '"' . ( is_string( $label ) && '' !== trim( $label ) ? ' role="group" aria-label="' . Escape::attr( $label ) . '"' : '' ) . '><ul>';
		if ( $this->media instanceof AssetReferenceResolver ) {
			foreach ( $assets as $reference ) {
				if ( ! is_string( $reference ) ) {
					continue;
				}
				$image = $this->media->resolve_reference( $reference );
				if ( ! is_array( $image ) || ! is_string( $image['url'] ?? null ) || ! SafeUrl::accepts( $image['url'] ) ) {
					continue;
				}
				$alt    = is_string( $image['alt'] ?? null ) ? $image['alt'] : '';
				$srcset = is_string( $image['srcset'] ?? null ) ? \Blixis\Builder\Media\MediaPolicy::srcset( $image['srcset'] ) : null;
				$sizes  = null !== $srcset && is_string( $image['sizes'] ?? null ) ? \Blixis\Builder\Media\MediaPolicy::sizes( $image['sizes'] ) : null;
				$html  .= '<li><img src="' . Escape::url( $image['url'] ) . '"' . ( null === $srcset ? '' : ' srcset="' . Escape::attr( $srcset ) . '"' ) . ( null === $sizes ? '' : ' sizes="' . Escape::attr( $sizes ) . '"' ) . ' width="' . (int) ( $image['width'] ?? 0 ) . '" height="' . (int) ( $image['height'] ?? 0 ) . '" alt="' . Escape::attr( $alt ) . '" loading="lazy" decoding="async">';
				if ( true === $node->value( 'captions', false ) && '' !== $alt ) {
					$html .= '<figcaption>' . Escape::html( $alt ) . '</figcaption>';
				}
				$html .= '</li>';
			}
		}
		return $html . '</ul></div>';
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
		$value = $node->value( 'value', 0 );
		$max   = $node->value( 'max', 100 );
		$value = is_numeric( $value ) ? (float) $value : 0;
		$max   = is_numeric( $max ) && (float) $max > 0 ? (float) $max : 100;
		$value = max( 0, min( $max, $value ) );
		$label = $node->value( 'ariaLabel' );
		return '<progress' . $hooks . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . ' value="' . $value . '" max="' . $max . '"></progress>';
	}

	/** Render disclosure sections with native keyboard and no-script behavior.
	 *
	 * @param ElementNode $node Accordion definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_accordion( ElementNode $node, string $hooks ): string {
		$items      = $node->value( 'items', [] );
		$items      = is_array( $items ) ? array_slice( $items, 0, 100 ) : [];
		$open       = $node->value( 'defaultOpen', [] );
		$open       = is_array( $open ) ? $open : [];
		$label      = $node->value( 'ariaLabel' );
		$attributes = is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '';
		$html       = '<div' . $hooks . $attributes . '>';
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
			$html .= '<details' . ( is_string( $id ) && in_array( $id, $open, true ) ? ' open' : '' ) . '><summary>' . Escape::html( $title ) . '</summary><div>' . Escape::html( $content ) . '</div></details>';
		}
		return $html . '</div>';
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
		$nav    = '<nav aria-label="' . Escape::attr( is_string( $label ) && '' !== trim( $label ) ? $label : 'Sections' ) . '"><ul>';
		$panels = '';
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
			$nav    .= '<li><a href="#' . $id . '">' . Escape::html( $title ) . '</a></li>';
			$panels .= '<section id="' . $id . '"><h2>' . Escape::html( $title ) . '</h2><p>' . Escape::html( $content ) . '</p></section>';
		}
		return '<div' . $hooks . '>' . $nav . '</ul></nav>' . $panels . '</div>';
	}

	/** Render a bounded ordered list with the current step announced accessibly.
	 *
	 * @param ElementNode $node Steps definition.
	 * @param string      $hooks Validated element hooks.
	 */
	private function render_steps( ElementNode $node, string $hooks ): string {
		$steps  = $node->value( 'steps', [] );
		$steps  = is_array( $steps ) ? array_slice( $steps, 0, 100 ) : [];
		$active = $node->value( 'activeStep', 0 );
		$active = is_numeric( $active ) ? max( 0, (int) $active ) : 0;
		$label  = $node->value( 'ariaLabel' );
		$html   = '<ol' . $hooks . ( is_string( $label ) && '' !== trim( $label ) ? ' aria-label="' . Escape::attr( $label ) . '"' : '' ) . '>';
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

	/** Render an imported asset reference through the media resolver.
	 *
	 * @param ElementNode $node Element input.
	 * @return string Safe image markup or an empty string.
	 */
	private function asset_image( ElementNode $node ): string {
		$reference = $node->value( 'assetRef' );
		if ( ! is_string( $reference ) || ! $this->media instanceof AssetReferenceResolver ) {
			return '';
		}
		$image = $this->media->resolve_reference( $reference );
		if ( null === $image || ! SafeUrl::accepts( $image['url'] ) ) {
			return '';
		}
		$alt = $node->value( 'alt', $image['alt'] );
		$alt = is_string( $alt ) ? $alt : '';
		if ( '' === $alt && true !== $node->value( 'decorative', false ) ) {
			$alt = $image['alt'];
		}
		$srcset = is_string( $image['srcset'] ?? null ) ? \Blixis\Builder\Media\MediaPolicy::srcset( $image['srcset'] ) : null;
		$sizes  = null !== $srcset && is_string( $image['sizes'] ?? null ) ? \Blixis\Builder\Media\MediaPolicy::sizes( $image['sizes'] ) : null;
		return '<img' . Escape::hooks( $node ) . ' src="' . Escape::url( $image['url'] ) . '"' . ( null === $srcset ? '' : ' srcset="' . Escape::attr( $srcset ) . '"' ) . ( null === $sizes ? '' : ' sizes="' . Escape::attr( $sizes ) . '"' ) . ' width="' . (int) $image['width'] . '" height="' . (int) $image['height'] . '" alt="' . Escape::attr( $alt ) . '" loading="lazy" decoding="async">';
	}
}
