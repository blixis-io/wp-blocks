<?php
/**
 * Plugin Name: Blixis Builder
 * Description: The Blixis page builder bootstrap.
 * Version: 0.1.0
 * Requires at least: 7.0
 * Tested up to: 7.1
 * Requires PHP: 8.2
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: blixis-builder
 * Domain Path: /languages
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

\defined( 'ABSPATH' ) || exit;

const VERSION               = '0.1.0';
const EXTENSION_API_VERSION = 2;
const FILE                  = __FILE__;
const DIR                   = __DIR__;

require_once DIR . '/src/Compatibility.php';

if ( ! Compatibility::supported( PHP_VERSION, \get_bloginfo( 'version' ) ) ) {
	\add_action(
		'admin_notices',
		static function (): void {
			\printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				\esc_html__( 'Blixis Builder requires PHP 8.2 or newer and WordPress 7.0 or newer.', 'blixis-builder' )
			);
		}
	);
	return;
}

require_once DIR . '/src/Autoloader.php';
Autoloader::register();

\register_activation_hook( FILE, [ Activation::class, 'activate' ] );
\register_deactivation_hook( FILE, [ Deactivation::class, 'deactivate' ] );
require_once DIR . '/src/functions.php';
Plugin::register();
