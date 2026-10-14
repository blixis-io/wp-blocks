<?php
/**
 * Verifies the PHP toolchain matches ADR 0001 (PHP 8.2 floor).
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

namespace Blixis\Tooling\Tests;

use PHPUnit\Framework\TestCase;
use Yoast\PHPUnitPolyfills\TestCases\TestCase as PolyfillTestCase;

/**
 * Smoke tests proving PHPUnit runs and the repository declares the agreed PHP floor.
 */
final class EnvironmentTest extends TestCase {

	/**
	 * Decoded root composer.json.
	 *
	 * @return array<string, mixed>
	 */
	private function composer_json(): array {
		$contents = file_get_contents( dirname( __DIR__, 3 ) . '/composer.json' );
		$this->assertIsString( $contents );
		$data = json_decode( $contents, true, 512, JSON_THROW_ON_ERROR );
		$this->assertIsArray( $data );
		/**
		 * Narrowed by the assertion above.
		 *
		 * @var array<string, mixed> $data
		 */
		return $data;
	}

	/**
	 * The running PHP satisfies the documented floor.
	 */
	public function test_running_php_meets_the_floor(): void {
		$this->assertGreaterThanOrEqual( 80200, PHP_VERSION_ID );
	}

	/**
	 * Composer resolves dependencies as if running on the floor version, so the lock file works on PHP 8.2.
	 */
	public function test_composer_platform_is_the_php_floor(): void {
		$data = $this->composer_json();
		$this->assertIsArray( $data['require'] );
		$this->assertSame( '>=8.2', $data['require']['php'] );
		$this->assertIsArray( $data['config'] );
		$this->assertIsArray( $data['config']['platform'] );
		$platform = $data['config']['platform']['php'];
		$this->assertIsString( $platform );
		$this->assertStringStartsWith( '8.2.', $platform );
	}

	/**
	 * The PHPUnit polyfills are available for the WordPress test suite (BWB-012, BWB-018).
	 */
	public function test_phpunit_polyfills_are_installed(): void {
		$this->assertTrue( class_exists( PolyfillTestCase::class ) );
	}
}
