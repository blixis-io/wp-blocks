<?php
/**
 * Bounded preview response.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** Keeps renderer output within the canvas transport budget. */
final class PreviewResult {
	public const MAX_HTML = 1048576;
	public const MAX_CSS  = 262144;

	/** Construct bounded safe output.
	 *
	 * @param string $html HTML fragment.
	 * @param string $css Compiled CSS.
	 * @throws \RuntimeException On unsafe or excessive renderer output.
	 */
	public function __construct( public readonly string $html, public readonly string $css ) {
		if ( \strlen( $html ) > self::MAX_HTML || \strlen( $css ) > self::MAX_CSS || ! PreviewSanitizer::accepts( $html ) ) {
			throw new \RuntimeException( 'Preview output rejected.' );
		}
	}
}
