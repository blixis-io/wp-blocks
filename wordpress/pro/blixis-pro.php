<?php
/**
 * Plugin Name: Blixis Pro
 * Description: Pro features for Blixis Builder, including safe WooCommerce display elements.
 * Version: 0.0.0
 * Requires at least: 6.6
 * Requires PHP: 8.2
 * Requires Plugins: blixis-builder, blixis-plus
 * Text Domain: blixis-pro
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package Blixis\Pro
 */

declare(strict_types=1);

namespace Blixis\Pro;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const MINIMUM_EXTENSION_API = 2;
const MINIMUM_PLAN_API      = 1;

/** Show a clear admin notice when the required Builder API is unavailable. */
function dependency_notice(): void {
	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}
	if ( ! function_exists( 'blixis_builder_extension_api_version' ) || blixis_builder_extension_api_version() < MINIMUM_EXTENSION_API || ! function_exists( 'blixis_builder_capability_api_version' ) || blixis_builder_capability_api_version() < 1 ) {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'Blixis Pro requires Blixis Builder with extension API version 2 or newer.', 'blixis-pro' ) . '</p></div>';
	} elseif ( ! function_exists( 'blixis_plus_api_version' ) || blixis_plus_api_version() < 1 || ! function_exists( 'blixis_plus_plan_api_version' ) || blixis_plus_plan_api_version() < MINIMUM_PLAN_API ) {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'Blixis Pro requires Blixis Plus with plan API version 1 or newer.', 'blixis-pro' ) . '</p></div>';
	} elseif ( ! function_exists( 'blixis_plus_has_plan' ) || ! blixis_plus_has_plan( 'pro' ) ) {
		echo '<div class="notice notice-warning"><p>' . esc_html__( 'Blixis Pro is installed, but no active Pro plan is available for this site.', 'blixis-pro' ) . '</p></div>';
	}
}
add_action( 'admin_notices', __NAMESPACE__ . '\dependency_notice' );

if ( ! function_exists( 'blixis_builder_extension_api_version' ) || blixis_builder_extension_api_version() < MINIMUM_EXTENSION_API || ! function_exists( 'blixis_builder_capability_api_version' ) || blixis_builder_capability_api_version() < 1 || ! function_exists( 'blixis_plus_api_version' ) || blixis_plus_api_version() < 1 || ! function_exists( 'blixis_plus_plan_api_version' ) || blixis_plus_plan_api_version() < MINIMUM_PLAN_API ) {
	return;
}

require_once __DIR__ . '/src/WooCommerceRenderer.php';

/** Grant only this add-on's Pro capabilities; commerce renderers independently fail safe without WooCommerce. */
add_filter(
	'blixis_builder_capability_available',
	static function ( mixed $available, string $capability, int $api_version ): bool {
		if ( true === $available ) {
			return true;
		}
		if ( ! function_exists( 'blixis_plus_has_plan' ) || ! blixis_plus_has_plan( 'pro' ) ) {
			return false;
		}
		$commerce_capabilities = array_map(
			static fn( string $element ): string => 'blixis-pro/' . $element,
			[ 'product-card', 'product-grid', 'product-title', 'product-image', 'product-gallery', 'product-price', 'product-rating', 'add-to-cart', 'product-variants', 'product-stock', 'product-description', 'product-tabs', 'cart-icon', 'mini-cart', 'cart-table', 'checkout-form', 'checkout-summary', 'coupon-field', 'account-menu', 'product-search', 'product-filters', 'product-categories', 'wishlist-button', 'upsells', 'cross-sells', 'order-summary' ]
		);
		return 1 === $api_version && in_array( $capability, $commerce_capabilities, true );
	},
	10,
	3
);

/** Register Pro renderers through the documented Builder extension point. */
add_filter(
	'blixis_builder_element_renderers',
	static function ( mixed $renderers, int $api_version ): array {
		if ( ! is_array( $renderers ) || 2 !== $api_version ) {
			return is_array( $renderers ) ? $renderers : [];
		}
		foreach ( [ 'cart-icon', 'mini-cart', 'cart-table', 'checkout-summary', 'account-menu', 'product-card', 'product-grid', 'product-title', 'product-image', 'product-gallery', 'product-price', 'product-rating', 'add-to-cart', 'product-stock', 'product-description', 'product-tabs', 'product-search', 'product-categories', 'product-variants', 'product-filters', 'upsells', 'cross-sells', 'order-summary', 'checkout-form', 'coupon-field', 'wishlist-button' ] as $element ) {
			$renderers[ 'blixis/' . $element ] = new WooCommerceRenderer( $element );
		}
		return $renderers;
	},
	10,
	2
);
