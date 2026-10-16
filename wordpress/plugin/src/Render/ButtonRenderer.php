<?php
/** Button renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;
/** Renders the corresponding core element. */
final class ButtonRenderer implements ElementRenderer {
	/**
	 * Render escaped element HTML.
	 *
	 * @param ElementNode   $node Node.
	 * @param RenderContext $context Context.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$variant = $node->value( 'variant', 'solid' );
		$variant = \in_array( $variant, [ 'solid', 'outline', 'link' ], true ) ? $variant : 'solid';
		$target  = true === $node->value( 'newTab', false ) ? ' target="_blank" rel="noopener noreferrer"' : '';
		$label   = $node->value( 'label', 'Button' );
		return '<a' . Escape::hooks( $node, 'blx-button blx-button--' . $variant ) . ' href="' . Escape::url( (string) $node->value( 'href', '#' ) ) . '"' . $target . '>' . ( \is_string( $label ) ? Escape::html( $label ) : RichText::render_validated( $label, false, $context->token_ids ) ) . '</a>';
	}
}
