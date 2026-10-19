<?php
/**
 * Plugin Name: Blixis Plus
 * Description: Plus add-on foundation for Blixis Builder.
 * Version: 0.0.0
 * Requires at least: 6.6
 * Requires PHP: 8.2
 * Requires Plugins: blixis-builder
 * Text Domain: blixis-plus
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package Blixis\Plus
 */

declare(strict_types=1);

namespace Blixis\Plus;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Show a clear notice when the public Builder API is unavailable. */
function dependency_notice(): void {
	if ( ! current_user_can( 'activate_plugins' ) || ( function_exists( 'blixis_builder_extension_api_version' ) && blixis_builder_extension_api_version() >= 2 ) ) {
		return;
	}
	echo '<div class="notice notice-error"><p>' . esc_html__( 'Blixis Plus requires Blixis Builder with extension API version 2 or newer.', 'blixis-plus' ) . '</p></div>';
}
add_action( 'admin_notices', __NAMESPACE__ . '\dependency_notice' );

if ( ! function_exists( 'blixis_plus_api_version' ) ) {
	/** Return the Plus add-on API version consumed by Pro. */
	function blixis_plus_api_version(): int {
		return 1;
	}
}
