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
		return in_array( $archetype, [ 'container','text','richtext','heading','button','link','image','navigation','list','card','layout','section','page','site-header','site-footer','site-logo','row','columns','grid','stack' ], true ); }
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
		if ( 'section' === $id ) {
			$candidate = $node->value( 'semanticTag', $node->value( 'tag', 'section' ) );
			if ( is_string( $candidate ) && in_array( $candidate, [ 'section','div','header','footer','main','aside','nav','article' ], true ) ) {
				$tag = $candidate;
			}
		}
		$hooks = Escape::hooks( $node );
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
		if ( 'image' === $id ) {
			$image = $this->asset_image( $node );
			if ( '' !== $image ) {
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
