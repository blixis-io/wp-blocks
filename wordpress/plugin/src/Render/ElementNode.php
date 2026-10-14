<?php
/** Safe node view.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Renderer input with already selected values. */
final class ElementNode {
	/**
	 * Apply the documented contract.
	 *
	 * @param string               $id Id.
	 * @param string               $type Type.
	 * @param array<string, mixed> $values Values.
	 * @param array<mixed>         $classes Generated class names from the CSS compiler.
	 */
	public function __construct( public readonly string $id, public readonly string $type, public readonly array $values, public readonly array $classes = [] ) {}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $name Name.
	 * @param mixed  $fallback Fallback.
	 */
	public function value( string $name, mixed $fallback = null ): mixed {
		return $this->values[ $name ] ?? $fallback;
	}
}
