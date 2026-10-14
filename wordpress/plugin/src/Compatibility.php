<?php
/**
 * Runtime version requirements, kept safe to load before Builder classes.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

\defined( 'ABSPATH' ) || exit;

/**
 * Checks the supported environment before loading the plugin.
 */
final class Compatibility {

	/**
	 * Whether both runtime floors are met.
	 *
	 * @param string $php_version PHP runtime version.
	 * @param string $wp_version  WordPress version.
	 * @return bool
	 */
	public static function supported( string $php_version, string $wp_version ): bool {
		return \version_compare( $php_version, '8.2', '>=' ) && \version_compare( $wp_version, '7.0', '>=' );
	}
}
