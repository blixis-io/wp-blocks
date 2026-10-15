<?php
/**
 * Validator that picks the rules by stream family.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Content streams and content snapshots get the content rules; everything else the envelope rules. */
final class StreamValidator implements DocumentValidator {
	/**
	 * Check a stored value.
	 *
	 * @param string $value Stream JSON.
	 * @param string $key Stream or snapshot key.
	 * @return bool
	 */
	public function accepts( string $value, string $key ): bool {
		if ( 0 === \strpos( $key, '_blixis_content_' ) || 0 === \strpos( $key, '_blixis_snap_content_' ) ) {
			return ( new ContentValidator() )->accepts( $value, $key );
		}
		return ( new EnvelopeValidator() )->accepts( $value, $key );
	}
}
