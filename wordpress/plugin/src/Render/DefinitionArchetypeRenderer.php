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
		return in_array( $archetype, [ 'container','simple','text','richtext','heading','button','link','image','gallery','navigation','list','code','card','layout','section','page','site-header','site-footer','site-logo','row','columns','grid','stack' ], true ); }
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
		if ( in_array( $id, [ 'navigation', 'navigation-menu' ], true ) && 'navigation' === $archetype && is_array( $node->value( 'items', null ) ) ) {
			return '<nav' . $hooks . '><ul>' . $this->navigation_items( $node->value( 'items', [] ), 0 ) . '</ul></nav>';
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
