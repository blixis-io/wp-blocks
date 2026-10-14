<?php
/**
 * Initial validation policy for BWB-040.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Validates only the envelope; full schema validation belongs to BWB-043. */
final class EnvelopeValidator implements DocumentValidator {
	/**
	 * Implement the storage contract.
	 *
	 * @param string $value Value.
	 * @param string $key Value.
	 */
	public function accepts( string $value, string $key ): bool {
		return null !== Envelope::decode( $value, $key );
	}
}
