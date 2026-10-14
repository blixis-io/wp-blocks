<?php
/**
 * Future design system persistence boundary (BWB-035).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/**
 * BWB-035 replaces this stub with validated save and rollback.
 */
final class DesignSystemStore {
	/**
	 * Apply a validated design system when BWB-035 provides persistence.
	 *
	 * @param array<string, mixed> $tokens Validated draft tokens.
	 * @return array{ok: false, reason: string} Not implemented until BWB-035.
	 */
	public static function apply( array $tokens ): array {
		unset( $tokens );
		return array(
			'ok'     => false,
			'reason' => 'not-implemented',
		);
	}
}
