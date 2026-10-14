<?php
/**
 * Builder bootstrap tests (BWB-039), without a WordPress installation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Stands in for WordPress.
}
if ( ! \defined( __NAMESPACE__ . '\\VERSION' ) ) {
	\define( __NAMESPACE__ . '\\VERSION', '0.1.0' );
}

require_once \dirname( __DIR__ ) . '/src/Compatibility.php';
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
require_once \dirname( __DIR__ ) . '/src/Activation.php';
require_once \dirname( __DIR__ ) . '/src/Deactivation.php';

require_once __DIR__ . '/FakeOptions.php';
require_once __DIR__ . '/WordPressFunctions.php';

/** Version checks, class mapping and activation persistence. */
final class BootstrapTest extends TestCase {

	/** Reset the tiny fake WordPress option store. */
	protected function setUp(): void {
		FakeOptions::$sites     = [ 1 => [] ];
		FakeOptions::$calls     = [];
		FakeOptions::$stack     = [];
		FakeOptions::$current   = 1;
		FakeOptions::$multisite = false;
	}

	/**
	 * Version-floor cases.
	 *
	 * @return array<string, array{string, string, bool}>
	 */
	public static function versions(): array {
		return [
			'below PHP floor'       => [ '8.1.99', '7.1', false ],
			'below WordPress floor' => [ '8.2', '6.9.9', false ],
			'both below'            => [ '8.1', '6.9', false ],
			'exact floors'          => [ '8.2', '7.0', true ],
			'newer versions'        => [ '8.3.0', '7.1', true ],
		];
	}

	/**
	 * Both floors must be satisfied.
	 *
	 * @param string $php       PHP version.
	 * @param string $wp        WordPress version.
	 * @param bool   $supported Expected support.
	 * @return void
	 */
	#[DataProvider( 'versions' )]
	public function test_version_floors( string $php, string $wp, bool $supported ): void {
		$this->assertSame( $supported, Compatibility::supported( $php, $wp ) );
	}

	/** The package version matches the PHP header and package metadata. */
	public function test_version_matches_package(): void {
		$root   = \dirname( __DIR__ );
		$source = (string) \file_get_contents( $root . '/blixis-builder.php' );
		$meta   = \json_decode( (string) \file_get_contents( $root . '/package.json' ), true );
		$this->assertSame( 1, \preg_match( '/^ \* Version: ([0-9]+\.[0-9]+\.[0-9]+)$/m', $source, $matches ) );
		$this->assertSame( VERSION, $matches[1] ?? null );
		$this->assertSame( VERSION, $meta['version'] );
	}

	/** The loader maps only valid names inside the Builder namespace. */
	public function test_autoloader_mapping(): void {
		$root = \dirname( __DIR__ );
		$this->assertSame( $root . '/src/Plugin.php', Autoloader::file_for( Plugin::class ) );
		$this->assertSame( $root . '/src/Nested/Example.php', Autoloader::file_for( __NAMESPACE__ . '\\Nested\\Example' ) );
		$this->assertNull( Autoloader::file_for( 'Blixis\\Theme\\Setup' ) );
		$this->assertNull( Autoloader::file_for( 'Blixis\\Builder' ) );
		$this->assertNull( Autoloader::file_for( __NAMESPACE__ . '\\..\\Example' ) );
		$this->assertNull( Autoloader::file_for( __NAMESPACE__ . '\\Bad/Example' ) );
		Autoloader::load( Plugin::class );
		$this->assertTrue( \class_exists( Plugin::class, false ) );
		Autoloader::load( __NAMESPACE__ . '\\Missing' );
	}

	/** Activation creates a non-autoloaded marker and cannot overwrite it on reactivation. */
	public function test_activation_is_create_only(): void {
		Activation::activate();
		$this->assertSame( VERSION, FakeOptions::$sites[1][ Activation::OPTION ] );
		$this->assertSame( [ 1, Activation::OPTION, VERSION, '', false ], FakeOptions::$calls[0] );
		FakeOptions::$sites[1][ Activation::OPTION ] = 'older-version';
		Activation::activate();
		Deactivation::deactivate();
		$this->assertSame( 'older-version', FakeOptions::$sites[1][ Activation::OPTION ] );
	}

	/** Network activation initializes each existing site independently and restores site context. */
	public function test_network_activation_is_per_site(): void {
		FakeOptions::$multisite = true;
		FakeOptions::$sites     = [
			1 => [ Activation::OPTION => 'prior' ],
			2 => [],
		];
		Activation::activate( true );
		$this->assertSame( 'prior', FakeOptions::$sites[1][ Activation::OPTION ] );
		$this->assertSame( [ Activation::OPTION => VERSION ], FakeOptions::$sites[2] );
		$this->assertSame( 1, FakeOptions::$current );
		$this->assertSame( [], FakeOptions::$stack );
	}
}
