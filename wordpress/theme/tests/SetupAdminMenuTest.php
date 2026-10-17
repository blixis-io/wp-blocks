<?php
/** Theme setup-menu integration contract.
 *
 * @package Blixis\Theme\Tests
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\SetupAdmin;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant for isolated tests.
}
require_once dirname( __DIR__ ) . '/src/SetupAdmin.php';

/** The theme retains a standalone route without registering a duplicate with the plugin active. */
final class SetupAdminMenuTest extends TestCase {
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Without the Builder plugin filter, register the Appearance wizard. */
	public function test_standalone_theme_keeps_appearance_wizard(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- WordPress menu/filter APIs are isolated test doubles.
		eval( 'namespace { $GLOBALS["theme_setup_pages"] = []; function apply_filters( $name, $value ) { return $value; } function __( $text, $domain = "" ) { return $text; } function add_theme_page( ...$args ) { $GLOBALS["theme_setup_pages"][] = $args; } }' );
		SetupAdmin::menu();
		$this->assertCount( 1, $GLOBALS['theme_setup_pages'] );
		$this->assertSame( 'blixis-setup', $GLOBALS['theme_setup_pages'][0][3] );
		$this->assertSame( 'edit_theme_options', $GLOBALS['theme_setup_pages'][0][2] );
	}

	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** With the Builder plugin filter, rely on the plugin submenu and avoid a duplicate Appearance page. */
	public function test_plugin_menu_owns_the_setup_submenu(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- WordPress menu/filter APIs are isolated test doubles.
		eval( 'namespace { $GLOBALS["theme_setup_pages"] = []; function apply_filters( $name, $value ) { return "blixis"; } function __( $text, $domain = "" ) { return $text; } function add_theme_page( ...$args ) { $GLOBALS["theme_setup_pages"][] = $args; } }' );
		SetupAdmin::menu();
		$this->assertSame( [], $GLOBALS['theme_setup_pages'] );
	}
}
