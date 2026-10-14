<?php
/**
 * Builder activation state.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

\defined( 'ABSPATH' ) || exit;

/**
 * Initializes the version marker without replacing saved state.
 */
final class Activation {

	public const OPTION = 'blixis_builder_version';

	/**
	 * Initialize each existing site when network activated; otherwise only the current site.
	 *
	 * @param bool $network_wide Whether activation is network wide.
	 * @return void
	 */
	public static function activate( bool $network_wide = false ): void {
		if ( $network_wide && is_multisite() ) {
			$sites = get_sites(
				[
					'fields' => 'ids',
					'number' => 0,
				]
			);
			foreach ( $sites as $site_id ) {
				switch_to_blog( (int) $site_id );
				self::activate_site();
				restore_current_blog();
			}
			return;
		}
		self::activate_site();
	}

	/** Store the marker once in the current site's non-autoloaded options. */
	private static function activate_site(): void {
		add_option( self::OPTION, VERSION, '', false );
	}
}
