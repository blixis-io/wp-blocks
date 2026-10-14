<?php
/** Bounded core document renderer.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\ElementRegistry;

\defined( 'ABSPATH' ) || exit;

/** Iterative postorder walk; no PHP call-stack recursion. */
final class CoreDocumentRenderer {
	/**
	 * Element renderers keyed by manifest type.
	 *
	 * @var array<string, ElementRenderer>
	 */
	private readonly array $renderers;
	/**
	 * Localized value selector.
	 *
	 * @var ContentResolver
	 */
	private readonly ContentResolver $content;

	/**
	 * Apply the documented contract.
	 *
	 * @param ElementRegistry $registry Registry.
	 * @param MediaResolver   $media Media.
	 */
	public function __construct( private readonly ElementRegistry $registry, MediaResolver $media ) {
		$this->content   = new ContentResolver( $registry );
		$this->renderers = [
			'blixis/heading'   => new HeadingRenderer(),
			'blixis/section'   => new SectionRenderer(),
			'blixis/container' => new ContainerRenderer(),
			'blixis/text'      => new TextRenderer(),
			'blixis/image'     => new ImageRenderer( $media ),
			'blixis/button'    => new ButtonRenderer(),
		];
	}

	/**
	 * Render escaped element HTML.
	 *
	 * @param \stdClass                    $document Document.
	 * @param string                       $locale Locale.
	 * @param string                       $mode Mode.
	 * @param array<string, array<string>> $class_names Generated class names by element ID (from the CSS compiler).
	 * @throws \RuntimeException When limits are exceeded.
	 */
	public function render( \stdClass $document, string $locale, string $mode, array $class_names = [] ): string {
		// Appearance affects CSS only (compiled separately); the compiler's class names are attached to the elements.
		unset( $mode );
		$roots = \is_array( $document->root ?? null ) ? $document->root : [];
		$stack = [];
		foreach ( \array_reverse( $roots ) as $node ) {
			$stack[] = [ $node, 1, false ];
		}
		$output = [];
		$count  = 0;
		while ( [] !== $stack ) {
			[ $node, $depth, $ready ] = \array_pop( $stack );
			if ( ! $node instanceof \stdClass || ! \is_string( $node->id ?? null ) || ! \is_string( $node->type ?? null ) ) {
				$output[] = '<div data-blx-invalid></div>';
				continue;
			}
			$children = \is_array( $node->children ?? null ) ? $node->children : [];
			if ( ! $ready ) {
				if ( ++$count > 5000 || $depth > 32 ) {
					throw new \RuntimeException( 'Document render limit exceeded.' );
				}
				$stack[] = [ $node, $depth, true ];
				foreach ( \array_reverse( $children ) as $child ) {
					$stack[] = [ $child, $depth + 1, false ];
				}
				continue;
			}
			$child_html = '';
			foreach ( $children as $_ ) {
				$child_html = \array_pop( $output ) . $child_html;
			}
			$renderer = $this->renderers[ $node->type ] ?? null;
			if ( null === $renderer || null === $this->registry->get( $node->type ) || 1 !== \preg_match( '/^[a-z0-9][a-z0-9_-]{2,63}$/D', $node->id ) ) {
				$output[] = '<div data-blx-invalid>' . $child_html . '</div>';
				continue;
			}
			$values   = $this->content->values( $node, $document, $locale );
			$output[] = $renderer->render( new ElementNode( $node->id, $node->type, $values, \is_array( $class_names[ $node->id ] ?? null ) ? $class_names[ $node->id ] : [] ), new RenderContext( $child_html ) );
		}
		return \implode( '', $output );
	}
}
