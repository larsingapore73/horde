<?php
/**
 * The core file list generator for package.xml files.
 *
 * PHP version 5
 *
 * @category Horde
 * @package  Pear
 * @author   Gunnar Wrobel <wrobel@pardus.de>
 * @license  http://www.fsf.org/copyleft/lgpl.html LGPL
 * @link     http://pear.horde.org/index.php?package=Pear
 */

/**
 * The core file list generator for package.xml files.
 *
 * Copyright 2011 The Horde Project (http://www.horde.org/)
 *
 * See the enclosed file COPYING for license information (LGPL). If you
 * did not receive this file, see http://www.fsf.org/copyleft/lgpl.html.
 *
 * @category Horde
 * @package  Pear
 * @author   Gunnar Wrobel <wrobel@pardus.de>
 * @license  http://www.fsf.org/copyleft/lgpl.html LGPL
 * @link     http://pear.horde.org/index.php?package=Pear
 */
class Horde_Pear_Package_Contents_List
{
    /**
     * The root path for the file listing.
     *
     * @var string
     */
    private $_root;

    /**
     * Handles ignoring files from the file list.
     *
     * @var Horde_Pear_Package_Contents_Ignore
     */
    private $_ignore;

    /**
     * Handles including files from the file list.
     *
     * @var Horde_Pear_Package_Contents_Include.
     */
    private $_include;

    /**
     * Constructor.
     *
     * @param Horde_Pear_Package_Type $type The package type.
     *
     * @return NULL
     */
    public function __construct(Horde_Pear_Package_Type $type)
    {
        $this->_root = $type->getRootPath();
        $this->_include = $type->getInclude();
        $this->_ignore = $type->getIgnore();
    }

    /**
     * Return the content list.
     *
     * @return array The file list.
     */
    public function getContents()
    {
        $list = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->_root)
        );
        $elements = array();
        foreach ($list as $element) {
            if ($this->_include->isIncluded($element)
                && !$this->_ignore->isIgnored($element)) {
                $elements[] = substr($element->getPathname(), strlen($this->_root));
            }
        }
        return $elements;
    }
}