<?php
/** Image renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Media\MediaPolicy;

\defined( 'ABSPATH' ) || exit;
/** Renders the corresponding core element. */
final class ImageRenderer implements ElementRenderer {
	/**
	 * Apply the documented contract.
	 *
	 * @param MediaResolver $media Media.
	 */
	public function __construct( private readonly MediaResolver $media ) {}
	/**
	 * Render escaped element HTML.
	 *
	 * @param ElementNode   $node Node.
	 * @param RenderContext $context Context.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$id    = $node->value( 'attachmentId' );
		$image = \is_int( $id ) && $id > 0 ? $this->media->resolve( $id ) : null;
		if ( null === $image || ! \is_string( $image['url'] ?? null ) || ! \Blixis\Builder\Registry\SafeUrl::accepts( $image['url'] ) || ! \is_int( $image['width'] ?? null ) || ! \is_int( $image['height'] ?? null ) || $image['width'] < 1 || $image['height'] < 1 ) {
			return '<div' . Escape::hooks( $node ) . ' data-blx-missing-media></div>';
		}
		$decorative = true === $node->value( 'decorative', false );
		$alt        = $decorative ? '' : \trim( (string) $node->value( 'alt', $image['alt'] ?? '' ) );
		$srcset     = \is_string( $image['srcset'] ?? null ) ? MediaPolicy::srcset( $image['srcset'] ) : null;
		$sizes      = null !== $srcset && \is_string( $image['sizes'] ?? null ) ? MediaPolicy::sizes( $image['sizes'] ) : null;
		// Accessibility: alt text is required unless the image is explicitly decorative; the hook lets the editor flag it.
		$flags = ( $decorative ? ' role="presentation"' : '' ) . ( ! $decorative && '' === $alt ? ' data-blx-alt-missing' : '' );
		return '<img' . Escape::hooks( $node ) . ' src="' . Escape::url( $image['url'] ) . '"' . ( null === $srcset ? '' : ' srcset="' . Escape::attr( $srcset ) . '"' ) . ( null === $sizes ? '' : ' sizes="' . Escape::attr( $sizes ) . '"' ) . ' width="' . $image['width'] . '" height="' . $image['height'] . '" alt="' . Escape::attr( $alt ) . '"' . $flags . ' loading="lazy" decoding="async">';
	}
}
