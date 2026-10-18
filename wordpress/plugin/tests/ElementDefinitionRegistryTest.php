<?php
/** Generated definition registry tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Tests for generated element definition metadata. */
final class ElementDefinitionRegistryTest extends TestCase {
	/** Loads every generated definition and resolves legacy namespaced ids. */
	public function test_generated_catalog_loads_and_namespaced_ids_resolve(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$this->assertCount( 253, $registry->all() );
		$this->assertSame( 'heading', $registry->get( 'blixis/heading' )['id'] ?? null );
		$this->assertSame( 'ready', $registry->get( 'heading' )['status'] ?? null );
		$this->assertSame( 'ready', $registry->get( 'grid' )['status'] ?? null );
	}

	/** Entitlements remain available by default while the filter is not installed. */
	public function test_entitlement_defaults_to_available_without_a_filter(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$this->assertSame( 'available', $registry->entitlement( 'heading' ) );
	}
}
