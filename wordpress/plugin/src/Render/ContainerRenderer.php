<?php
/** Container renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;
/** Renders the corresponding core element. */
final class ContainerRenderer implements ElementRenderer {
	/**
	 * Render escaped element HTML.
	 *
	 * @param ElementNode   $node Node.
	 * @param RenderContext $context Context.
	 */
	public function render( ElementNode $node, RenderContext $context ): string {
		$width = $node->value( 'maxWidth', 'default' );
		$width = \in_array( $width, [ 'narrow', 'default', 'wide', 'full' ], true ) ? $width : 'default';
		return '<div' . Escape::hooks( $node ) . ' data-blx-max-width="' . $width . '">' . $context->children_html . '</div>';
	}
}
